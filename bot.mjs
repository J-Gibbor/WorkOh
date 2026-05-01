import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} from "@whiskeysockets/baileys"

import sharp from "sharp"
import { createCanvas } from "canvas"
import pino, { levels } from "pino"
import fs from "fs"
import express from "express"
import QRCode from "qrcode"
import path from "path"
import { fileURLToPath } from "url"
import os from "os"
import moment from "moment-timezone"
import ffmpegPath from "ffmpeg-static"
import { exec } from "child_process"
import https from "https"


const __dirname = path.dirname(fileURLToPath(import.meta.url))

const AUTH_FOLDER = path.join(__dirname, "auth")

const app = express()
const logger = pino({ level : "silent"})

// Use host-provided port OR fallback to 3000
const PORT = process.env.PORT || 3000

 let qrCount = 0

app.get("/", (req, res) => {
  try {
    if (!CURRENT_QR) {
      return res.send("✅ Bot is connected and running")
    }

    res.send(`
      <h2>📱 Scan QR</h2>
      <img src="${CURRENT_QR}" />
    `)
  } catch {
    res.send("Server error")
  }
})

app.get("/ping", (req, res) => res.send("alive"))

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`)
})

// ===== GLOBAL CRASH PROTECTION =====
process.on("uncaughtException", (err) => {
  console.log("🔥 Uncaught Exception:", err)
})

process.on("unhandledRejection", (err) => {
  console.log("🔥 Unhandled Rejection:", err)
})

// ===== GLOBAL STATES =====
let CURRENT_QR = ""
let reconnecting = false


// ================= CONFIG =================
const PREFIX = "."
const BOT_STATS = {
  startTime: Date.now(),
  messages: 0,
  commands: 0
}

const GROUP_SCHEDULES = {}
let warns = {} 
// ================= WARN DATABASE =================
const WARN_DB = global.WARN_DB || (global.WARN_DB = {})

const WARN_LIMIT = 3

const saveWarnDB = () => {
  try {
    fs.writeFileSync(
      "./warn_db.json",
      JSON.stringify(WARN_DB, null, 2)
    )
  } catch (e) {
    console.log("WARN SAVE ERROR:", e)
  }
}

const loadWarnDB = () => {
  try {
    if (fs.existsSync("./warn_db.json")) {
      Object.assign(
        WARN_DB,
        JSON.parse(fs.readFileSync("./warn_db.json"))
      )
    }
  } catch (e) {
    console.log("WARN LOAD ERROR:", e)
  }
}

loadWarnDB()

const addWarn = async (sock, jid, user, reason) => {
  if (!WARN_DB[jid]) WARN_DB[jid] = {}
  if (!WARN_DB[jid][user]) WARN_DB[jid][user] = []

  WARN_DB[jid][user].push({
    reason,
    time: Date.now()
  })

  const count = WARN_DB[jid][user].length

  if (count >= WARN_LIMIT) {
    try {
      await sock.groupParticipantsUpdate(jid, [user], "remove")

      delete WARN_DB[jid][user]

      await sock.sendMessage(jid, {
        text: `🚫 @${user.split("@")[0]} removed (${reason})`,
        mentions: [user]
      })
    } catch (e) {
      console.log("WARN REMOVE ERROR:", e)
    }
  } else {
    await sock.sendMessage(jid, {
      text: `⚠️ @${user.split("@")[0]} warning ${count}/${WARN_LIMIT}\nReason: ${reason}`,
      mentions: [user]
    })
  }

  saveWarnDB()
}



// ===== SAFE DEPLOY HOOK =====
const triggerRenderDeploy = async () => {
  const hook = process.env.RENDER_DEPLOY_HOOK 

  if (!hook) {
    throw new Error("Missing RENDER_DEPLOY_HOOK in environment")
  }

  const res = await fetch(hook, {
    method: "POST"
  })

  if (!res.ok) {
    throw new Error(`Render deploy failed: ${res.status}`)
  }

  return true
}


// ==== STICKER META ====

const STICKER_META = {
  packname: "GIBBORLEE BOT 🤖",
  author: "Sticker Engine v2"
}

const createSticker = async (buffer) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("Invalid buffer")
  }

  try {
    return await sharp(buffer)
      .resize(512, 512, { fit: "contain" })
      .webp({ quality: 80 })
      .toBuffer()
  } catch (e) {
    console.log("Sticker error:", e)
    throw new Error("Unsupported image format")
  }
}

  // =====MENU COMMANDS ====

const COMMANDS = {
  // 🛡️ PROTECTION
  antilink: "🚫 Block WhatsApp & external links",
  antibadword: "🧼 Auto-remove offensive words",
  antidelete: "🧠 Recover deleted messages",
  antistatus: "👁️ Block status viewing detection",
  antistatusmention: "📢 Block status mentions",

  // 👥 ADMIN
  kick: "👢 Remove a user from group",
  add: "➕ Add user to group",
  invite: "🔗 Sends group invite link to a user",
  promote: "⬆️ Promote user to admin",
  demote: "⬇️ Remove admin privileges",
  tagall: "📣 Mention all members",
  hidetag: "👻 Hidden group mention",
  tagonline: "🟢 Tag active members",

  // ⚙️ GROUP
setname: "✏️ Change group name",
setdesc: "📝 Update group description",
  groupinfo: "📊 View group analytics",
  grouplink: "🔗 Get invite link",
  revoke: "♻️ Reset invite link",
  lock: "🔒 Lock group (admins only)",
  unlock: "🔓 Unlock group chat",
   mute: "🔇 Mute a user",
unmute: "🔊 Unmute a user",
mutelist: "📋 View muted users",
clearlinks: "🧹 Reinforce anti-link",
opentemp: "🔓 Open group temporarily",
closetemp: "🔒 Lock group temporarily",

  // 🕒 SCHEDULE
  setopen: "🌅 Set daily group opening time",
  setclose: "🌙 Set daily group closing time",
  schedule: "📅 View group schedule",
  scheduleon: "✅ Enable group schedule",
  scheduleoff: "⛔ Disable group schedule",
  delschedule: "🗑️ Delete group schedule",

  // 🎨 MEDIA
  // 👁️ STATUS
  getstatus: "📥 Extract WhatsApp status (image/video/text from reply)",
  vv: "👁️ Recover view-once media",
  pp: "🖼️ HD profile picture fetch",
  sticker: "🎭 Convert image to sticker",
  stickergif: "🎬 Video → animated sticker",
  memesticker: "😂 Text → meme sticker",
  captionsticker: "✍️ Caption → sticker",
  stickerpack: "📦 Create custom sticker pack",

  // 👑 OWNER
  addowner: "👑 Add bot owner",
  delowner: "🗑️ Remove bot owner",
  owners: "📋 View all owners",
  restart: "🔄 Restart bot system",
  shutdown: "⛔ Shutdown bot safely",
  broadcast: "📢 Send message to all chats",
  ban: "🚷 Block user access",
  unban: "✅ Unblock user access",
  pin: "📌 Pin a replied message (group or DM)",
  unpin: "📍 Unpin a pinned message",

    // ⚠️ WARNING SYSTEM
  warn: "⚠️ Warn a user (auto kick at 3 warns)",
  warnlist: "📋 View all warnings in group",
  warninfo: "👤 Check a user warning history",
  unwarn: "🧹 Clear user warnings",
  resetwarns: "♻️ Clear all warnings",
 

  // 🔐 MODE
 mode: "⚙️ Switch bot operating mode (public/private/group/dm/auto)",

  // ℹ️ INFO
  alive: "💚 Check bot status",
  whoami: "🆔 Show your WhatsApp ID",
  stats: "📊 Bot usage statistics",
  ping: "🏓 Check bot response speed (latency test)",

// 📦 STICKER PACK SYSTEM
packcreate: "📦 Create a new sticker pack",
packadd: "➕ Add image/video sticker to pack",
packview: "👀 View stickers inside a pack",
packlist: "📚 View all saved sticker packs",
packdelete: "🗑️ Delete a sticker pack",
packsend: "🎲 Send random sticker from pack",
}

const groupCommands = (cmdObj) => {
  const groups = {
    "🛡️ GROUP PROTECTION": [],
    "👥 ADMIN MODERATION": [],
    "⚙️ GROUP MANAGEMENT": [],
    "🕒 SCHEDULE": [],
    "⚠️ WARNING SYSTEM": [],
    "🎨 MEDIA": [],
    "📦 STICKER PACK SYSTEM": [],
    "👑 OWNER CONTROL": [],
    "🔐 MODE CONTROL": [],
    "ℹ️ INFO": [],
  }

  for (const [cmd, desc] of Object.entries(cmdObj)) {
    const line = `│ .${cmd} → ${desc}`

    if (["antilink","antibadword","antidelete","antistatus","antistatusmention"].includes(cmd)) {
      groups["🛡️ GROUP PROTECTION"].push(line)
    }

    else if (["kick","add", "invite","promote","demote","tagall","hidetag","tagonline"].includes(cmd)) {
      groups["👥 ADMIN MODERATION"].push(line)
    }

    else if (["setname","setdesc","groupinfo","grouplink","revoke","lock","unlock","mute","unmute","mutelist","clearlinks","opentemp","closetemp"].includes(cmd)) {
      groups["⚙️ GROUP MANAGEMENT"].push(line)
    
    }

    else if (["setopen","setclose","schedule","scheduleon","scheduleoff","delschedule"].includes(cmd)) {
      groups["🕒 SCHEDULE"].push(line)
    }

    else if (["warn","warnlist","warninfo","unwarn","resetwarns"].includes(cmd)) {
  groups["⚠️ WARNING SYSTEM"].push(line)
}

    else if (["getstatus","vv","pp","sticker","stickergif","memesticker","captionsticker","stickerpack"].includes(cmd)) {
      groups["🎨 MEDIA"].push(line)
    }

    else if (["addowner","delowner","owners","restart","shutdown","broadcast","ban","unban","pin","unpin"].includes(cmd)) {
      groups["👑 OWNER CONTROL"].push(line)
    }

    else if (["mode"].includes(cmd)) {
      groups["🔐 MODE CONTROL"].push(line)
    }

    else if (["alive", "ping", "whoami","stats"].includes(cmd)) {
      groups["ℹ️ INFO"].push(line)
    }


else if (["packcreate","packadd","packview","packlist","packdelete","packsend"].includes(cmd)) {
  groups["📦 STICKER PACK SYSTEM"].push(`│ .${cmd} → ${cmdObj[cmd]}`)
}
  }

  return groups
}


const menuHeaders = [
  "╭─❖ 🤖 𝐆𝐈𝐁𝐁𝐎𝐑𝐋𝐄𝐄 𝐁𝐎𝐓 𝐌𝐄𝐍𝐔 ❖─╮",
  "╭─⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐎𝐍𝐋𝐈𝐍𝐄 • 𝐆𝐈𝐁𝐁𝐎𝐑𝐋𝐄𝐄 ⚡─╮",
  "╭─🚀 𝐌𝐔𝐋𝐓𝐈-𝐅𝐔𝐍𝐂𝐓𝐈𝐎𝐍 𝐏𝐀𝐍𝐄𝐋 🚀─╮",
  "╭─🔥 𝐏𝐎𝐖𝐄𝐑 𝐌𝐎𝐃𝐄: 𝐀𝐂𝐓𝐈𝐕𝐄 🔥─╮",
  "╭─🧠 𝐒𝐌𝐀𝐑𝐓 𝐁𝐎𝐓 𝐈𝐍𝐓𝐄𝐑𝐅𝐀𝐂𝐄 🧠─╮",
  "╭─📡 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃 • 𝐖𝐇𝐀𝐓𝐒𝐀𝐏𝐏 𝐍𝐄𝐓𝐖𝐎𝐑𝐊 📡─╮",
  "╭─🛡️ 𝐒𝐄𝐂𝐔𝐑𝐈𝐓𝐘 𝐒𝐘𝐒𝐓𝐄𝐌 𝐀𝐂𝐓𝐈𝐕𝐄 🛡️─╮",
  "╭─⚙️ 𝐄𝐍𝐆𝐈𝐍𝐄 𝐋𝐎𝐀𝐃𝐄𝐃 • 𝐑𝐄𝐀𝐃𝐘 ⚙️─╮",
  "╭─🌐 𝐆𝐋𝐎𝐁𝐀𝐋 𝐍𝐄𝐓𝐖𝐎𝐑𝐊 𝐎𝐍𝐋𝐈𝐍𝐄 🌐─╮",
  "╭─💥 𝐔𝐋𝐓𝐑𝐀 𝐏𝐄𝐑𝐅𝐎𝐑𝐌𝐀𝐍𝐂𝐄 💥─╮",
  "╭─📊 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 𝐏𝐀𝐍𝐄𝐋 📊─╮",
  "╭─🔔 𝐑𝐄𝐀𝐋-𝐓𝐈𝐌𝐄 𝐌𝐎𝐍𝐈𝐓𝐎𝐑 🔔─╮",
  "╭─👑 𝐎𝐖𝐍𝐄𝐑 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 𝐃𝐀𝐒𝐇𝐁𝐎𝐀𝐑𝐃 👑─╮"
]

const getHeader = () =>
  menuHeaders[Math.floor(Math.random() * menuHeaders.length)]


// ================= PERMISSION SYSTEM =================

// extract only numbers
const getUserId = (jid = "") => {
  if (typeof jid !== "string") return ""
  return jid.split("@")[0].replace(/\D/g, "")
}

// normalize jid safely
const normalizeJid = (jid = "") => {
  if (typeof jid !== "string") return ""

  jid = jid.split(":")[0]

  if (jid.includes("@lid")) {
    jid = jid.replace("@lid", "")
  }

  return jid.includes("@")
    ? jid.split("@")[0] + "@s.whatsapp.net"
    : ""
}

// check roles
const getPermissions = ({ msg, sock, BOT_OWNERS, groupAdmins }) => {
  const senderRaw = msg.key?.participant || msg.key?.remoteJid || ""
  const sender =
  msg.key.participant ||
  msg.key.remoteJid ||
  ""
  const botId = normalizeJid(sock.user?.id || "")

  const senderId = getUserId(sender)
  const botUserId = getUserId(botId)

  const ownerIds = BOT_OWNERS.map(o =>
    getUserId(normalizeJid(o))
  )

  const isBot = msg.key.fromMe

  const isOwner =
    isBot || // 🔥 bot always owner
    senderId === botUserId ||
    ownerIds.includes(senderId)

  const isAdmin = groupAdmins
    ?.map(a => normalizeJid(a))
    .map(getUserId)
    .includes(senderId)

  return {
    sender,
    senderId,
    botId,
    isBot,
    isOwner,
    isAdmin
  }
}

// ================= FILES =================
const GROUP_SETTINGS_FILE = "./group-settings.json"
const STORE_FILE = "./msg-store.json"
const OWNERS_FILE = "./owners.json"
const SETTINGS_FILE = "./settings.json"

// Optional save function
const saveGroupSchedules = () => {
  fs.writeFileSync("./group_schedules.json", JSON.stringify(GROUP_SCHEDULES, null, 2))
}

let GROUP_SETTINGS = fs.existsSync(GROUP_SETTINGS_FILE) ? JSON.parse(fs.readFileSync(GROUP_SETTINGS_FILE)) : {}

let SETTINGS = fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE)) : {}

let MSG_STORE = fs.existsSync(STORE_FILE) ? JSON.parse(fs.readFileSync(STORE_FILE)) : {}

let BOT_OWNERS = fs.existsSync(OWNERS_FILE) ? JSON.parse(fs.readFileSync(OWNERS_FILE)) : []

const saveGroupSettings = () => fs.writeFileSync(GROUP_SETTINGS_FILE, JSON.stringify(GROUP_SETTINGS, null, 2))

const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(SETTINGS, null, 2))

let STICKER_PACKS = fs.existsSync("./stickerpacks.json")
  ? JSON.parse(fs.readFileSync("./stickerpacks.json"))
  : {}

const saveStickerPacks = () =>
  fs.writeFileSync("./stickerpacks.json", JSON.stringify(STICKER_PACKS, null, 2))

// 🔥 FORCE GLOBAL DEFAULT MODE
if (!SETTINGS["global"]) {
  SETTINGS["global"] = { mode: "public" }
  saveSettings()
}

// 🔥 FIX CORRUPTED MODE
if (!["public", "private"].includes(SETTINGS["global"]?.mode)) {
  SETTINGS["global"].mode = "public"
  saveSettings()
}

const saveStore = () => fs.writeFileSync(STORE_FILE, JSON.stringify(MSG_STORE, null, 2))
const saveOwners = () => fs.writeFileSync(OWNERS_FILE, JSON.stringify(BOT_OWNERS, null, 2))

const getGroup_Settings = (jid) => {
  if (!GROUP_SETTINGS[jid]) {
    GROUP_SETTINGS[jid] = { 
      antidelete: false,
      antibadword: false, 
      antilink: false,
      antistatus: false,
      antistatus_mention: false
    }
    saveGroupSettings()
  }
  return GROUP_SETTINGS[jid]
}

const getSettings = (jid) => {
   if (!SETTINGS[jid]) {
    SETTINGS[jid] = {
      mode: "public",
    }
    saveSettings()
  }
    return SETTINGS[jid]
  }


// ================= START =================
async function start(session) {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(`${AUTH_FOLDER}/${session}`)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      emitOwnEvents: true,
      syncFullHistory: false,
      browser: ["Chrome (Linux)", "Chrome", "120.0.0"],

        // 🔥 stability boost
  connectTimeoutMs: 60000,
  keepAliveIntervalMs: 25000,
  defaultQueryTimeoutMs: 60000

    })

    sock.ev.on("creds.update", saveCreds)

    // ===== CONNECTION HANDLER =====
  sock.ev.on("connection.update", async (u) => {
        const { connection, qr, lastDisconnect } = u
  
        if (qr) {
          qrCount++
    if (qrCount > 6) {
      console.log("❌ Too many QR attempts, restarting clean session...")
      process.exit(1)
    }
          CURRENT_QR = await QRCode.toDataURL(qr)
          console.log("📱 QR READY")
        }
  
        if (connection === "open") {
          CURRENT_QR = ""
          reconnecting = false
  
          console.log("✅ Bot connected")
  
         const botId = normalizeJid(sock.user.id)

const myNumber = [
  "2347044625110@s.whatsapp.net"
]
  
  // merge safely
const ids = [botId, ...myNumber]

// clean + normalize + remove empties
const cleaned = [...new Set(
  ids
    .map(normalizeJid)
    .filter(Boolean)
)]
  
 for (const id of cleaned) {
  if (!BOT_OWNERS.includes(id)) {
    BOT_OWNERS.push(id)
  }
}

saveOwners()
  
  console.log("🤖 Logged in as:", botId)
  console.log("👑 Owners:", BOT_OWNERS)
  
          // ✅ PREVENT MULTIPLE INTERVALS
          
            setInterval(() => {
              try {
                sock.sendPresenceUpdate("unavailable")
              } catch {}
            }, 2000)
          }
  
        if (connection === "close") {
          
           const statusCode = lastDisconnect?.error?.output?.statusCode
  
      console.log("❌ Disconnected:", statusCode)
  
      // ❌ Logged out (DO NOT reconnect)
      if (statusCode === 401 || statusCode === 405) {
        console.log("⚠️ Logged out → delete auth folder")
        return
      }
  
        if (!reconnecting) {
      reconnecting = true
  
      setTimeout(() => {
        reconnecting = false
        start(session)
      }, 5000)
    }
  
      // 🔄 Safe reconnect
      console.log("🔄 Reconnecting safely in 5s...")
      setTimeout(() => start(session), 5000)
        }
      })


 // ================= EVENTS =================

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    const jid = msg.key.remoteJid || ""
    if (!msg.message) return
    let groupAdmins = []

if (jid.endsWith("@g.us")) {
  const meta = await sock.groupMetadata(jid)
  groupAdmins = meta.participants
    .filter(p => p.admin)
    .map(p => p.id)
}

// ✅ NEW PERMISSION SYSTEM
const {
  sender,
  isOwner,
  isAdmin,
  isBot
} = getPermissions({ msg, sock, BOT_OWNERS, groupAdmins })
    // const sender = normalizeJid(msg.key.participant || msg.key.remoteJid)

const cleanSender = normalizeJid(sender)


// const isOwner =
//   normalizedOwners.includes(cleanSender) ||
//   cleanSender === botId
    BOT_STATS.messages++
    // const isBot = msg.key.fromMe
    const isGroup = jid.includes("@g.us")
    const isDM = !isGroup
    const settings = getSettings("global")
    const group_settings = getGroup_Settings(jid || "default")
    if (!msg.message) return


// 🔥 FORCE DM PUSH RECOGNITION
if (isDM) {
  await sock.sendPresenceUpdate("available", jid)
}

const body =
  msg.message?.conversation ||
  msg.message?.extendedTextMessage?.text ||
  msg.message?.imageMessage?.caption ||
  msg.message?.videoMessage?.caption ||
  ""


const reply = async (text) => {
  try {
    await sock.sendMessage(jid, { text }, { quoted: msg })

    await sock.sendPresenceUpdate("paused", jid)

  } catch (e) {
    console.log(e)
  }
}

    const getTarget = () => {
  const context = msg.message?.extendedTextMessage?.contextInfo

  return (
    context?.mentionedJid?.[0] ||
    context?.participant ||
    msg.key.participant ||   // group sender fallback
    msg.key.remoteJid
  )
}

    // ================= SAVE MESSAGE =================
    // ===== LIGHTWEIGHT MESSAGE STORE (ANTI-MEMORY LEAK) =====
    const MAX_STORE = 5000
        // ===== SAFE STORE LIMIT =====
        if (Object.keys(MSG_STORE).length > MAX_STORE) {
          MSG_STORE = {} // reset to prevent memory crash
        }
        

        MSG_STORE[msg.key.id] = {
          message: msg.message,
          sender,
          chat: jid,
        }

        // 💡 SAVE LESS FREQUENTLY (reduce disk load)
        if (Math.random() < 0.1) saveStore()

// ================= ANTI-LINK =================
  if (isGroup && group_settings.antilink && body) {
    const links = ["http", "wa.me", ".com", ".net", "chat.whatsapp.com"]

    if (links.some(l => body.toLowerCase().includes(l))) {
      if (!isAdmin && !isOwner) {

        await sock.sendMessage(jid, { delete: msg.key })

        await addWarn(sock, jid, sender, "Link detected")

        return
      }
    }
  }

   if (group_settings.antistatus && msg.key.remoteJid === "status@broadcast") {
    try {
      await sock.readMessages([msg.key])

      await addWarn(sock, jid, sender, "Status viewing blocked")

    } catch (e) {
      console.log(e)
    }
  }

   if (group_settings.antistatus_mention) {
    const text =
      msg.message?.extendedTextMessage?.text ||
      msg.message?.conversation ||
      ""

    if (text.includes("@")) {
      await sock.sendMessage(jid, { delete: msg.key })

      await addWarn(sock, jid, sender, "Status mention detected")

      await sock.sendMessage(jid, {
        text: "🚫 Status mention blocked"
      })
    }
  }

   if (isGroup && group_settings.antibadword && body) {
    const badwords = ["fuck", "shit", "bitch", "asshole"]

    if (badwords.some(w => body.toLowerCase().includes(w))) {
      if (!isAdmin && !isOwner) {

        await sock.sendMessage(jid, { delete: msg.key })

        await addWarn(sock, jid, sender, "Bad word detected")

        await reaction(jid, msg.key, "🧼")

        return
      }
    }
  }

  // ================= ANTI STATUS FIX =================
if (isGroup && (group_settings.antistatus || group_settings.antistatus_mention)) {
  try {
    const isStatus = jid === "status@broadcast"

    if (isStatus) {

      const senderId = sender

      // 🚫 DELETE STATUS VIEW MESSAGE (if possible)
      try {
        await sock.sendMessage(jid, { delete: msg.key })
      } catch {}

      // ================= WARN SYSTEM =================
      warns[senderId] = (warns[senderId] || 0) + 1

      await sock.sendMessage(jid, {
        text: `🚫 Anti-Status Triggered\n\n👤 User: @${senderId.split("@")[0]}\n⚠️ Warn: ${warns[senderId]}/3`,
        mentions: [senderId]
      })

      // ================= AUTO KICK =================
      if (warns[senderId] >= WARN_LIMIT) {
        await sock.groupParticipantsUpdate(jid, [senderId], "remove")
        delete warns[senderId]

        await sock.sendMessage(jid, {
          text: `🚨 Removed @${senderId.split("@")[0]} for status abuse`,
          mentions: [senderId]
        })
      }
    }

    // ================= ANTI STATUS MENTION =================
    const text =
      msg.message?.extendedTextMessage?.text ||
      msg.message?.conversation ||
      ""

    if (group_settings.antistatus_mention && text.includes("@")) {

      await sock.sendMessage(jid, { delete: msg.key })

      warns[sender] = (warns[sender] || 0) + 1

      await sock.sendMessage(jid, {
        text: `📢 Anti-Status Mention Blocked\n\n👤 @${sender.split("@")[0]}\n⚠️ Warn: ${warns[sender]}/3`,
        mentions: [sender]
      })

      if (warns[sender] >= WARN_LIMIT) {
        await sock.groupParticipantsUpdate(jid, [sender], "remove")
        delete warns[sender]
      }
    }

  } catch (e) {
    console.log("❌ Anti-status error:", e)
  }
}

    // ================= ANTI DELETE =================
    if (group_settings.antidelete) {
      const proto = msg.message?.protocolMessage
      if (proto?.type === 0) {
        const original = MSG_STORE[proto.key.id]
        if (original) {
          await sock.sendMessage(jid, { text: "🚨 Anti-delete triggered" })

          await sock.sendMessage(jid, {
            forward: {
              key: {
                remoteJid: original.chat,
                fromMe: false,
                id: proto.key.id,
                participant: original.sender
              },
              message: original.message
            }
          })
        }
      }
    }

  // COMMAND EMOJI MAP

  const COMMAND_REACTIONS = {
  antilink: "🚫",
  antibadword: "🧼",
  antidelete: "🧠",
  antistatus: "👁️",
  antistatusmention: "📢",

  kick: "👢",
  add: "➕",
  invite: "🔗",
  promote: "⬆️",
  demote: "⬇️",
  tagall: "📣",
  hidetag: "👻",
  tagonline: "🟢",
  delete: "❌",
  del: "🧼",

  setname: "✏️",
  setdesc: "📝",
  groupinfo: "📊",
  grouplink: "🔗",
  revoke: "♻️",
  lock: "🔒",
  unlock: "🔓",

  getstatus: "📥",
  vv: "👁️",
  pp: "🖼️",
  sticker: "🎭",
  stickergif: "🎬",
  memesticker: "😂",
  captionsticker: "✍️",
  stickerpack: "📦",

  addowner: "👑",
  delowner: "🗑️",
  owners: "📋",
  restart: "🔄",
  shutdown: "⛔",
  broadcast: "📢",
  ban: "🚷",
  unban: "✅",
  pin:"📌",
  unpin:"📍",

  warn: "⚠️",
  warnlist: "📋",
  warninfo: "👤",
  unwarn: "🧹",

  mode: "⚙️",
  alive: "💚",
  whoami: "🆔",
  stats: "📊",
  ping: "🏓",
  menu: "📃",
  settings: "🛠️",

  packcreate: "📦",
  packadd: "➕",
  packview: "👀",
  packlist: "📚",
  packdelete: "🗑️",
  packsend: "🎲",
}
   

    // ================= COMMAND =================
 // ================= COMMAND HANDLER =================

const isCommand = body.startsWith(PREFIX)
if (!isCommand) return
const GROUP_SCHEDULES = global.GROUP_SCHEDULES || (global.GROUP_SCHEDULES = {})

// ===== PARSE =====
const args = body.slice(1).trim().split(/ +/)
const cmd = args.shift()?.toLowerCase() || ""

// ================= SAFE REACT =================

const react = async (emoji) => {
  try {
    if (!emoji || !msg?.key) return

    await sock.sendMessage(
      jid,
      {
        react: {
          text: emoji,
          key: msg.key
        }
      }
    )

    // small delay helps WhatsApp register reaction first
    await new Promise(res => setTimeout(res, 300))

  } catch (err) {
    console.log("❌ Reaction failed:", err)
  }
}

// ===== AUTO SCHEDULER CHECKER =====
// Place ONCE globally (outside commands)
setInterval(async () => {
  try {
    const now = moment().tz("Africa/Lagos").format("HH:mm")

    for (const groupId of Object.keys(GROUP_SCHEDULES)) {
      const schedule = GROUP_SCHEDULES[groupId]
      if (!schedule || !schedule.enabled) continue

      // ===== AUTO OPEN =====
      if (schedule.open === now && schedule.lastOpen !== now) {
        try {
          await sock.groupSettingUpdate(groupId, "not_announcement")

          await sock.sendMessage(groupId, {
            text:
`🔓 *SCHEDULED GROUP OPENED*

⏰ Time: ${schedule.open}`
          })

          schedule.lastOpen = now
          saveGroupSchedules()

        } catch (e) {
          console.log("AUTO OPEN ERROR:", e)
        }
      }

      // ===== AUTO CLOSE =====
      if (schedule.close === now && schedule.lastClose !== now) {
        try {
          await sock.groupSettingUpdate(groupId, "announcement")

          await sock.sendMessage(groupId, {
            text:
`🔒 *SCHEDULED GROUP CLOSED*

⏰ Time: ${schedule.close}`
          })

          schedule.lastClose = now
          saveGroupSchedules()

        } catch (e) {
          console.log("AUTO CLOSE ERROR:", e)
        }
      }
    }

  } catch (e) {
    console.log("SCHEDULER ERROR:", e)
  }
}, 30000) // checks every 30s

// ================= MODES =================
const botMode = settings?.mode || "public"

if (botMode === "private") {
  if (!isOwner && !isBot) return
}

if (botMode === "group") {
  if (!isGroup && !isOwner) return
}

if (botMode === "dm") {
  if (!isDM && !isOwner) return
}

if (botMode === "auto") {
  // 👥 Groups = everyone
  // 💬 DMs = owner only
  if (isDM && !isOwner && !isBot) return
}


// ================= OPTIONAL DEBUG =================
if (isDM) {
  console.log(`📩 DM CMD: ${cmd} from ${sender}`)
  console.log("OWNER CHECK:", cleanSender, isOwner)
}
    
    const commands = {

      
      // ===== MEDIA =====
      vv: async () => {
  if (!isOwner) return reply("❌ Owner only")

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
  if (!quoted) return reply("❌ Reply to a view-once message")

  const type = Object.keys(quoted)[0]
  const content = quoted[type]

  if (!content) return reply("❌ Invalid message")

  try {
    const stream = await downloadContentFromMessage(
      content,
      type.replace("Message", "")
    )

    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    let sendType = "document"
    if (type === "imageMessage") sendType = "image"
    else if (type === "videoMessage") sendType = "video"
    else if (type === "audioMessage") sendType = "audio"

    // 📤 send result
    const sent = await sock.sendMessage(sender, {
      [sendType]: buffer,
      caption: "👁️ View-once recovered"
    })

    // // 💣 delete result AFTER 15s
    // setTimeout(async () => {
    //   try {
    //     await sock.sendMessage(sender, { delete: sent.key })
    //   } catch (e) {
    //     console.log("VV result delete failed:", e)
    //   }
    // }, 15000)

    // 💣 DELETE COMMAND MESSAGE (immediately or slight delay)
    setTimeout(async () => {
      try {
        await sock.sendMessage(sender, {
          delete: msg.key
        })
      } catch (e) {
        console.log("VV command delete failed:", e)
      }
    }, 4000)

  } catch (e) {
    console.log(e)
    reply("❌ Failed to extract media")
  }
},

      pp: async () => {
  if (!isOwner) return reply("❌ Owner only")

  let target = getTarget() || sender

  try {
    const url = await sock.profilePictureUrl(target, "image")

    const sent = await sock.sendMessage(sender, {
      image: { url },
      caption: "🖼️ Profile picture HD"
    })

    // // 💣 delete result after 15s
    // setTimeout(async () => {
    //   try {
    //     await sock.sendMessage(sender, { delete: sent.key })
    //   } catch (e) {
    //     console.log("PP result delete failed:", e)
    //   }
    // }, 15000)

    // 💣 delete command message
    setTimeout(async () => {
      try {
        await sock.sendMessage(sender, {
          delete: msg.key
        })
      } catch (e) {
        console.log("PP command delete failed:", e)
      }
    }, 2000)

  } catch {
    reply("❌ Cannot fetch profile picture")
  }
},

      sticker: async () => {
        if (!isOwner) return reply("❌ Owner only")
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

  let mediaMessage =
    msg.message?.imageMessage ||
    quoted?.imageMessage

  if (!mediaMessage) return reply("❌ Reply to an image")

  const stream = await downloadContentFromMessage(mediaMessage, "image")

  let buffer = Buffer.from([])
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk])
  }

  const stickerBuffer = await createSticker(buffer)

  await sock.sendMessage(jid, {
    sticker: stickerBuffer
  }, { quoted: msg })
},

stickergif: async () => {
  if (!isOwner) return reply("❌ Owner only")

const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

const media =
  msg.message?.imageMessage ||
  msg.message?.videoMessage ||
  quoted?.imageMessage ||
  quoted?.videoMessage

  if (!media) return reply("❌ Reply to image, video or GIF")

  const input = "./temp_input"
  const output = "./temp.webp"

  try {
    // detect type
const type =
  msg.message?.imageMessage ? "image" :
  msg.message?.videoMessage ? "video" :
  quoted?.imageMessage ? "image" :
  quoted?.videoMessage ? "video" :
  null

if (!type) return reply("❌ Unsupported media")

const mediaObj =
  msg.message?.imageMessage ||
  msg.message?.videoMessage ||
  quoted?.imageMessage ||
  quoted?.videoMessage

const stream = await downloadContentFromMessage(mediaObj, type)

try {
  const stream = await downloadContentFromMessage(mediaObj, type)

  let buffer = Buffer.from([])
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk])
  }

} catch (e) {
  console.log("DOWNLOAD ERROR:", e)
  return reply("❌ Media download failed (encrypted or expired message)")
}

    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    fs.writeFileSync(input, buffer)

    // IMAGE → STICKER (fast path)
    if (type === "image") {
      const sticker = await createSticker(buffer)

      return sock.sendMessage(jid, {
        sticker
      }, { quoted: msg })
    }

    // VIDEO / GIF → STICKER (ffmpeg)
    exec(
      `${ffmpegPath} -y -i ${input} ` +
      `-vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15" ` +
      `-t 6 -r 15 ${output}`,
      async (err) => {
        if (err) {
          console.log(err)
          return reply("❌ Conversion failed")
        }

        const stickerBuffer = fs.readFileSync(output)

        await sock.sendMessage(jid, {
          sticker: stickerBuffer
        }, { quoted: msg })

        // cleanup
      // cleanup (SAFE VERSION)
try {
  if (fs.existsSync(input)) fs.unlinkSync(input)
  if (fs.existsSync(output)) fs.unlinkSync(output)
} catch (e) {
  console.log("Cleanup error:", e)
}
      }
    )

  } catch (e) {
    console.log("STICKER ERROR:", e)
    reply("❌ Failed to convert to sticker")
  }
},

// ================= FIXED MEMESTICKER (NO OVERFLOW + PERFECT CENTER) =================
memesticker: async () => {
  if (!isOwner) return reply("❌ Owner only")

  const text = args.join(" ").trim()
  if (!text) return reply("❌ Provide text")

  // 🔥 React first
  await react("😂")

  // 🔥 Auto-delete command after 2s
  setTimeout(async () => {
    try {
      await sock.sendMessage(jid, {
        delete: msg.key
      })
    } catch (e) {
      console.log("Command delete failed:", e)
    }
  }, 2000)

  // ===== SAFE TEXT =====
  const safeText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  // ===== SMART WORD WRAP =====
  const maxCharsPerLine = 14
  const words = safeText.split(/\s+/)

  const lines = []
  let currentLine = ""

  for (const word of words) {
    // break very long single words
    if (word.length > maxCharsPerLine) {
      if (currentLine) {
        lines.push(currentLine.trim())
        currentLine = ""
      }

      for (let i = 0; i < word.length; i += maxCharsPerLine) {
        lines.push(word.slice(i, i + maxCharsPerLine))
      }
      continue
    }

    if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
      currentLine += ` ${word}`
    } else {
      lines.push(currentLine.trim())
      currentLine = word
    }
  }

  if (currentLine.trim()) lines.push(currentLine.trim())

  // ===== LIMIT MAX LINES =====
  const finalLines = lines.slice(0, 7)

  // ===== DYNAMIC FONT SIZE =====
  let fontSize = 48
  if (finalLines.length >= 5) fontSize = 34
  if (finalLines.length >= 6) fontSize = 30
  if (finalLines.length >= 7) fontSize = 26

  const lineHeight = fontSize + 14

  // ===== TRUE VERTICAL CENTER =====
  const totalHeight = finalLines.length * lineHeight
  const startY = (512 - totalHeight) / 2 + fontSize

  // ===== SVG TEXT =====
  const textElements = finalLines
    .map((line, i) => {
      const y = startY + i * lineHeight

      return `
      <!-- Outline -->
      <text
        x="256"
        y="${y}"
        font-size="${fontSize}"
        font-family="Arial"
        font-weight="bold"
        text-anchor="middle"
        dominant-baseline="middle"
        stroke="white"
        stroke-width="3"
        paint-order="stroke"
        fill="black">
        ${line}
      </text>`
    })
    .join("")

  // ===== SVG CANVAS =====
  const svg = `
  <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    ${textElements}
  </svg>`

  try {
    const png = await sharp(Buffer.from(svg), {
      density: 300
    })
      .png()
      .toBuffer()

    const sticker = await createSticker(png)

    await sock.sendMessage(
      jid,
      { sticker },
      { quoted: msg }
    )

  } catch (e) {
    console.log("MEME ERROR:", e)
    reply("❌ Meme sticker failed")
  }
},

captionsticker: async () => {
  if (!isOwner) return reply("❌ Owner only")
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

  const text =
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    quoted?.imageMessage?.caption ||
    quoted?.videoMessage?.caption

  if (!text) return reply("❌ No caption found")

const canvas = createCanvas(512, 512)
const ctx = canvas.getContext("2d")

ctx.fillStyle = "white"
ctx.fillRect(0, 0, 512, 512)

ctx.fillStyle = "black"
ctx.font = "bold 40px Sans"
ctx.textAlign = "center"

ctx.fillText(text, 256, 256)

const buffer = canvas.toBuffer("image/png")
const sticker = await createSticker(buffer)

  await sock.sendMessage(jid, {
    sticker,
    ...STICKER_META
  }, { quoted: msg })
},

stickerpack: async () => {
  if (!isOwner) return reply("❌ Owner only")
  const name = args.join(" ") || "🎭 Special Pack"
const author = msg.pushName || "Bot User"

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

  let media =
    msg.message?.imageMessage ||
    quoted?.imageMessage

  if (!media) return reply("❌ Reply to image")

  const stream = await downloadContentFromMessage(media, "image")

  let buffer = Buffer.from([])
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])

  const sticker = await createSticker(buffer)

await sock.sendMessage(jid, {
  sticker,
  packname: name,
  author
}, { quoted: msg })
},

// =========== PACKS ===========

//  CREATE PACK

pack_create: async () => {
  if (!isOwner) return reply("❌ Owner only")
  const name = args[0]?.toLowerCase()

  if (!name)
    return reply("❌ Usage: .pack create <name>")

  if (STICKER_PACKS[name])
    return reply("❌ Pack already exists")

  STICKER_PACKS[name] = {
    owner: sender,
    created: Date.now(),
    stickers: []
  }

  saveStickerPacks()

  reply(`📦 Pack *${name}* created successfully`)
},

// ADD PACK

pack_add: async () => {
  if (!isOwner) return reply("❌ Owner only")

  const name = args[0]?.toLowerCase()
  const emoji = args[1] || "🙂"

  if (!name) {
    return reply("❌ Usage: .pack add <name> [emoji]")
  }

  const pack = STICKER_PACKS[name]
  if (!pack) {
    return reply("❌ Pack not found")
  }

  const quoted =
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

  let media = null
  let type = null

  // ===== DIRECT MESSAGE =====
  if (msg.message?.imageMessage) {
    media = msg.message.imageMessage
    type = "image"
  } 
  else if (msg.message?.videoMessage) {
    media = msg.message.videoMessage
    type = "video"
  } 
  else if (msg.message?.stickerMessage) {
    media = msg.message.stickerMessage
    type = "sticker"
  }

  // ===== QUOTED MESSAGE =====
  else if (quoted?.imageMessage) {
    media = quoted.imageMessage
    type = "image"
  } 
  else if (quoted?.videoMessage) {
    media = quoted.videoMessage
    type = "video"
  } 
  else if (quoted?.stickerMessage) {
    media = quoted.stickerMessage
    type = "sticker"
  }

  if (!media) {
    return reply("❌ Reply to an image, video, or sticker")
  }

  try {
    const stream = await downloadContentFromMessage(media, type)

    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    if (!buffer.length) {
      return reply("❌ Failed to download media")
    }

    // ===== SAVE TO PACK =====
    pack.stickers.push({
      type,
      emoji,
      data: buffer.toString("base64")
    })

    saveStickerPacks()

    return reply(
`➕ Added to *${name}* pack ${emoji}

📦 Type: ${type}
📊 Total stickers: ${pack.stickers.length}`
    )

  } catch (err) {
    console.error("PACK ADD ERROR:", err)
    return reply("❌ Failed to add sticker")
  }
},

// VIEW PACKS

pack_view: async () => {
  if (!isOwner) return reply("❌ Owner only")
  const name = args[0]?.toLowerCase()

  if (!name)
    return reply("❌ Usage: .pack view <name>")

  const pack = STICKER_PACKS[name]

  if (!pack)
    return reply("❌ Pack not found")

  let text = `📦 *PACK: ${name}*\n\n`

  pack.stickers.forEach((s, i) => {
    text += `${i + 1}. ${s.emoji} ${s.type}\n`
  })

  reply(text)
},

// LIST PACKS

pack_list: async () => {
  if (!isOwner) return reply("❌ Owner only")
  const packs = Object.keys(STICKER_PACKS)

  if (!packs.length)
    return reply("❌ No packs available")

  let text = "📦 *STICKER PACKS*\n\n"

  packs.forEach(p => {
    text += `• ${p} (${STICKER_PACKS[p].stickers.length})\n`
  })

  reply(text)
},

// DELETE PACK

pack_delete: async () => {
  if (!isOwner) return reply("❌ Owner only")
  const name = args[0]?.toLowerCase()

  if (!name)
    return reply("❌ Usage: .pack delete <name>")

  if (!STICKER_PACKS[name])
    return reply("❌ Pack not found")

  delete STICKER_PACKS[name]
  saveStickerPacks()

  reply(`🗑️ Pack *${name}* deleted`)
},

// SEND PACK

pack_send: async () => {
  if (!isOwner) return reply("❌ Owner only")
  const name = args[0]?.toLowerCase()

  if (!name)
    return reply("❌ Usage: .pack send <name>")

  const pack = STICKER_PACKS[name]

  if (!pack || !pack.stickers.length)
    return reply("❌ Empty or missing pack")

  const random =
    pack.stickers[Math.floor(Math.random() * pack.stickers.length)]

  const buffer = Buffer.from(random.data, "base64")

  await sock.sendMessage(jid, {
    sticker: buffer,
    caption: random.emoji
  }, { quoted: msg })
},

      // ===== TOGGLES =====
      antidelete: async () => {
        if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")
        group_settings.antidelete = args[0] === "on"
        saveGroupSettings()
        reply(`🧠 Anti-delete ${group_settings.antidelete ? "ON" : "OFF"}`)
      },

      antilink: async () => {
        if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")
        group_settings.antilink = args[0] === "on"
        saveGroupSettings()
        reply(`🔗 Anti-link ${group_settings.antilink ? "ON" : "OFF"}`)
      },

      antibadword: async () => {
  if (!isAdmin && !isOwner) return reply("❌ Admin only  or Bot owner only")

  group_settings.antibadword = args[0] === "on"
  saveGroupSettings()

  reply(`🧼 Anti-badword ${group_settings.antibadword ? "ON" : "OFF"}`)
},

     settings: async () => {
  if (!isOwner)  {
    await react("❌")
    return reply("❌ Owner only")
  }

  reply(
`⚙️ *SETTINGS PANEL*

🛡️ *Protection*
🧠 Anti-Delete: ${group_settings.antidelete ? "✅ ON" : "❌ OFF"}
🔗 Anti-Link: ${group_settings.antilink ? "✅ ON" : "❌ OFF"}
🧼 Anti-Badword: ${group_settings.antibadword ? "✅ ON" : "❌ OFF"}

👁️ *Status Protection*
🚫 Anti-Status: ${group_settings.antistatus ? "✅ ON" : "❌ OFF"}
📢 Anti-Status Mention: ${group_settings.antistatus_mention ? "✅ ON" : "❌ OFF"}

🔐 *Bot Mode*
⚙️ Mode: ${String(settings.mode || "public").toUpperCase()}

📊 *System*
👥 Group: ${isGroup ? "✅ Group Chat" : "❌ Private Chat"}
👑 Your Role: ${isOwner ? "Bot Owner" : isAdmin ? "Group Admin" : "Member"}`
  )
},
     
      // ======== WARNING ==========

  // ================= WARN USER =================
warn: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .warn @user | reply | 2348012345678 reason")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = normalizeJid(number + "@s.whatsapp.net")

  if (!target) return reply("❌ Invalid user")

  // reason parsing:
  // mention/reply => args after command
  // raw number => args after first number
  const reason =
    getTarget()
      ? args.join(" ").trim()
      : args.slice(1).join(" ").trim() ||
        "No reason provided"

  if (!WARN_DB[jid]) WARN_DB[jid] = {}

  // normalize existing user key
  let userKey =
    Object.keys(WARN_DB[jid]).find(
      u => normalizeJid(u) === target
    ) || target

  if (!WARN_DB[jid][userKey]) {
    WARN_DB[jid][userKey] = []
  }

  WARN_DB[jid][userKey].push({
    reason,
    by: sender,
    time: Date.now()
  })

  saveWarnDB()

  const count = WARN_DB[jid][userKey].length

  await reply(
`⚠️ *WARNING ISSUED*

👤 User: @${number}
⚠️ Warn: ${count}/3
📝 Reason: ${reason}`,
    {
      mentions: [target]
    }
  )

  // ================= AUTO KICK SYSTEM =================
  if (count >= 3) {
    try {
      await sock.groupParticipantsUpdate(jid, [target], "remove")

      delete WARN_DB[jid][userKey]
      saveWarnDB()

      return reply(
`🚫 @${number} removed after reaching 3 warnings`,
        {
          mentions: [target]
        }
      )
    } catch (e) {
      console.log("Warn auto-kick error:", e)

      return reply(
`⚠️ @${number} reached 3 warnings but removal failed`,
        {
          mentions: [target]
        }
      )
    }
  }
},

warnlist: async () => {
  if (!isGroup) return reply("❌ Group only")
if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  const data = WARN_DB[jid]
  if (!data || Object.keys(data).length === 0)
    return reply("📭 No warnings in this group")

  let text = "⚠️ *GROUP WARNINGS*\n\n"

  for (const user in data) {
    const warns = data[user]

    text += `👤 @${user.split("@")[0]}\n`
    text += `⚠️ Count: ${warns.length}\n`

    warns.forEach((w, i) => {
      text += `   ${i + 1}. ${w.reason}\n`
    })

    text += "\n"
  }

  await sock.sendMessage(jid, {
    text,
    mentions: Object.keys(data)
  })
},

// ================= CLEAR USER WARNINGS =================
unwarn: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .unwarn @user | reply | 2348012345678")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = normalizeJid(number + "@s.whatsapp.net")

  if (!target) return reply("❌ Invalid user")

  if (!WARN_DB[jid]) WARN_DB[jid] = {}

  // normalize warn keys safety
  const existingUsers = Object.keys(WARN_DB[jid]).map(normalizeJid)

  if (!existingUsers.includes(target)) {
    return reply(`❌ No warnings found for @${number}`, {
      mentions: [target]
    })
  }

  // remove matching normalized key safely
  for (const user of Object.keys(WARN_DB[jid])) {
    if (normalizeJid(user) === target) {
      delete WARN_DB[jid][user]
    }
  }

  saveWarnDB()

  reply(`✅ Warnings cleared for @${number}`, {
    mentions: [target]
  })
},

warninfo: async () => {
  if (!isGroup) return reply("❌ Group only")
if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  const target = getTarget() || sender

  const warns = WARN_DB[jid]?.[target] || []

  if (!warns.length)
    return reply("✅ No warnings for this user")

  let text = `⚠️ *WARN INFO*\n\n👤 @${target.split("@")[0]}\n\n`

  warns.forEach((w, i) => {
    text += `⚠️ ${i + 1}. ${w.reason}\n`
  })

  reply(text)
},

// ================= RESET WARNS =================
resetwarns: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  await react("♻️")

  WARN_DB[jid] = {}
  saveWarnDB()

  reply("♻️ All group warnings cleared")
},


      viewadmins: async () => {
  if (!isGroup) return reply("❌ Group only")
    if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  try {
    const meta = await sock.groupMetadata(jid)

    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id)

    if (!admins.length) {
      return reply("❌ No admins found")
    }

    const text =
      "👑 *Group Admins*\n\n" +
      admins.map((a, i) => ` ${i + 1}. @${a.split("@")[0]}`).join("\n")

    await sock.sendMessage(jid, {
      text,
      mentions: admins
    })

  } catch (e) {
    console.log(e)
    reply("❌ Failed to fetch admins (bot may not be admin)")
  }
},

    
 // ================= ADD OWNER =================
addowner: async () => {
  if (!isOwner) return reply("❌ Owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .addowner @user | reply | 2348012345678")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const clean = normalizeJid(number + "@s.whatsapp.net")

  if (!clean) return reply("❌ Invalid number")

  // normalize owner list first
  BOT_OWNERS = [...new Set(
    BOT_OWNERS
      .map(normalizeJid)
      .filter(Boolean)
  )]

  if (BOT_OWNERS.includes(clean)) {
    return reply(`⚠️ @${number} is already an owner`, {
      mentions: [clean]
    })
  }

  BOT_OWNERS.push(clean)
  saveOwners()

  reply(`👑 Owner added successfully:\n@${number}`, {
    mentions: [clean]
  })
},

// ================= REMOVE OWNER =================
delowner: async () => {
  if (!isOwner) return reply("❌ Owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .delowner @user | reply | 2348012345678")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const clean = normalizeJid(number + "@s.whatsapp.net")

  if (!clean) return reply("❌ Invalid number")

  // Prevent removing self/main bot owner
  const protectedOwners = [
    normalizeJid(sock.user.id),
    "2347044625110@s.whatsapp.net"
  ]

  if (protectedOwners.includes(clean)) {
    return reply("❌ Cannot remove protected main owner")
  }

  BOT_OWNERS = [...new Set(
    BOT_OWNERS
      .map(normalizeJid)
      .filter(Boolean)
  )]

  if (!BOT_OWNERS.includes(clean)) {
    return reply(`⚠️ @${number} is not in owner list`, {
      mentions: [clean]
    })
  }

  BOT_OWNERS = BOT_OWNERS.filter(
    x => normalizeJid(x) !== clean
  )

  saveOwners()

  reply(`🗑️ Owner removed successfully:\n@${number}`, {
    mentions: [clean]
  })
},

// 📋 LIST OWNERS BY NUMBER ONLY
owners: async () => {
   if (!isOwner) return reply("❌ Owner only")
  if (!BOT_OWNERS.length) {
    return reply("❌ No owners found")
  }

  reply(
    "👑 Owners:\n" +
    BOT_OWNERS.map((o, i) => `${i + 1}. ${o.split("@")[0]}`).join("\n")
  )
},

   restart: async () => {
  if (!isOwner) return reply("❌ Owner only")

  await reply("🔄 Restarting bot safely...")

  try {
    // optional: log restart event or save state
    console.log("🔄 Bot restart requested by owner")

    // small delay to ensure message is sent
    setTimeout(() => {
      // clean exit so Render restarts container properly
      process.exit(0)
    }, 1500)

  } catch (e) {
    console.log("Restart error:", e)
    reply("❌ Restart failed")
  }
},

restart_force: async () => {
  if (!isOwner) return reply("❌ Owner only")

  await reply("🔄 Restarting bot safely...")

  setTimeout(() => {
    // intentional crash → Render auto-redeploys container
    throw new Error("BOT_RESTART_TRIGGER")
  }, 1500)
},

shutdown: async () => {
  if (!isOwner) return reply("❌ Owner only")

  try {
    await reply("⛔ Shutting down bot safely...")

    console.log("⛔ Shutdown triggered by owner")

    // small delay to ensure message delivery
    setTimeout(() => {
      // clean exit signal for Render
      process.exit(0)
    }, 1500)

  } catch (e) {
    console.log("Shutdown error:", e)
    process.exit(1)
  }
},

shutdown_force: async () => {
  if (!isOwner) return reply("❌ Owner only")

  await reply("⛔ Bot shutting down...")

  setTimeout(() => {
    throw new Error("BOT_SHUTDOWN_TRIGGER")
  }, 1500)
},

broadcast: async () => {
  if (!isOwner) return reply("❌ Owner only")

  const message = args.join(" ")
  if (!message) return reply("❌ Provide message")

  try {
    const allChats = Object.keys(sock.store?.chats || MSG_STORE)

    let success = 0

    for (const chat of allChats) {
      try {
        await sock.sendMessage(chat, {
          text: `📢 OWNER BROADCAST\n\n${message}`
        })

        success++

        await new Promise(r => setTimeout(r, 800))
      } catch {}
    }

    reply(`✅ Broadcast sent to ${success} chats`)
  } catch (e) {
    console.log(e)
    reply("❌ Broadcast failed")
  }
},

// ================= BAN USER =================
ban: async () => {
   if (!isGroup) return reply("❌ Group only")
  if (!isOwner) return reply("❌ Owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .ban @user | reply | 2348012345678")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = normalizeJid(number + "@s.whatsapp.net")

  if (!target) return reply("❌ Invalid user")

  if (!SETTINGS.banned) SETTINGS.banned = []

  // normalize existing banned list
  SETTINGS.banned = SETTINGS.banned
    .map(normalizeJid)
    .filter(Boolean)

  if (SETTINGS.banned.includes(target)) {
    return reply(`❌ @${number} is already banned`, {
      mentions: [target]
    })
  }

  SETTINGS.banned.push(target)
  saveSettings()

  reply(`🚷 User banned:\n@${number}`, {
    mentions: [target]
  })
},

// ================= UNBAN USER =================
unban: async () => {
   if (!isGroup) return reply("❌ Group only")
  if (!isOwner) return reply("❌ Owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .unban @user | reply | 2348012345678")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = normalizeJid(number + "@s.whatsapp.net")

  if (!target) return reply("❌ Invalid user")

  if (!SETTINGS.banned) SETTINGS.banned = []

  const wasBanned = SETTINGS.banned
    .map(normalizeJid)
    .includes(target)

  if (!wasBanned) {
    return reply(`❌ @${number} is not banned`, {
      mentions: [target]
    })
  }

  SETTINGS.banned = SETTINGS.banned.filter(
    u => normalizeJid(u) !== target
  )

  saveSettings()

  reply(`✅ User unbanned:\n@${number}`, {
    mentions: [target]
  })
},


// ================= MUTE USER =================
// ================= MUTE USER =================
mute: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  await react("🔇")

  // supports mention, reply, or raw number
  let target =
    normalizeJid(getTarget()) ||
    normalizeJid(args[0]?.replace(/\D/g, "") + "@s.whatsapp.net")

  if (!target) return reply("❌ Mention, reply, or provide number")

  // global store safety
  global.MUTED_USERS = global.MUTED_USERS || {}
  const MUTED_USERS = global.MUTED_USERS

  if (!MUTED_USERS[jid]) MUTED_USERS[jid] = []

  if (MUTED_USERS[jid].includes(target)) {
    return reply("❌ User already muted")
  }

  MUTED_USERS[jid].push(target)

  reply(`🔇 @${target.split("@")[0]} has been muted`, {
    mentions: [target]
  })
},

// ================= UNMUTE USER =================
unmute: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  await react("🔊")

  // supports mention, reply, or raw number
  let target =
    normalizeJid(getTarget()) ||
    normalizeJid(args[0]?.replace(/\D/g, "") + "@s.whatsapp.net")

  if (!target) return reply("❌ Mention, reply, or provide number")

  global.MUTED_USERS = global.MUTED_USERS || {}
  const MUTED_USERS = global.MUTED_USERS

  if (!MUTED_USERS[jid] || !MUTED_USERS[jid].includes(target)) {
    return reply("❌ User is not muted")
  }

  MUTED_USERS[jid] = MUTED_USERS[jid].filter(u => u !== target)

  reply(`🔊 @${target.split("@")[0]} has been unmuted`, {
    mentions: [target]
  })
},

// ================= MUTE LIST =================
mutelist: async () => {
  if (!isGroup) return reply("❌ Group only")

  await react("📋")

  const muted = MUTED_USERS[jid] || []

  if (!muted.length) {
    return reply("📭 No muted users")
  }

  const text =
`🔇 *MUTED USERS LIST*

${muted.map((u, i) => `${i + 1}. @${u.split("@")[0]}`).join("\n")}`

  await sock.sendMessage(jid, {
    text,
    mentions: muted
  })
},

// ================= DELETE ALL LINKS =================
clearlinks: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  await react("🧹")

  group_settings.antilink = true
  saveGroupSettings()

  reply("🧹 Anti-link reinforced. New links will be auto-deleted.")
},



      // ===== TAG =====
     tageveryone: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  try {
    const meta = await sock.groupMetadata(jid)

    const members = meta.participants
      .map(p => p.id)
      .filter(Boolean)

    if (!members.length) return reply("❌ No members found")

    await reply(`📢 Tagging ${members.length} members...`)

    for (let i = 0; i < members.length; i++) {
      const user = members[i]

      await sock.sendMessage(jid, {
        text: `👋 Hi @${user.split("@")[0]}`,
        mentions: [user]
      })

      // 🔥 delay = anti-ban protection
      await new Promise(res => setTimeout(res, 1200))
    }

    reply("✅ Tagging completed")

  } catch (e) {
    console.log("Tagall Delay Error:", e)
    reply("❌ Failed to tag members")
  }
},

tagall: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  try {
    const meta = await sock.groupMetadata(jid)

    const members = meta.participants
      .map(p => p.id)
      .filter(Boolean)

    if (!members.length) return reply("❌ No members found")

    const chunkSize = 20 // 🔥 safe limit per message
    const chunks = []

    for (let i = 0; i < members.length; i += chunkSize) {
      chunks.push(members.slice(i, i + chunkSize))
    }

    await reply(`📢 Tagging ${members.length} members in ${chunks.length} batches...`)

    for (let i = 0; i < chunks.length; i++) {
      const batch = chunks[i]

      const text =
        `📢 *Tag Batch ${i + 1}/${chunks.length}*\n\n` +
        batch.map(u => `👤 @${u.split("@")[0]}`).join("\n")

      await sock.sendMessage(jid, {
        text,
        mentions: batch
      })

      // 🔥 delay between batches
      await new Promise(res => setTimeout(res, 2500))
    }

    reply("✅ All members tagged safely")

  } catch (e) {
    console.log("Paginated Tagall Error:", e)
    reply("❌ Failed to execute paginated tag")
  }
},
tagonline: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  try {
    const meta = await sock.groupMetadata(jid)

    const members = meta.participants
      .map(p => p.id)
      .filter(Boolean)

    if (!members.length) return reply("❌ No members found")

    // 🟡 Active users tracker (simple in-memory fallback)
    const activeUsers = members.filter(u => {
      // If bot has seen them recently in chat memory
      const lastMsg = MSG_STORE?.[u]
      return lastMsg ? true : false
    })

    // 🔥 fallback if no tracked active users
    const targets = activeUsers.length > 0 ? activeUsers : members.slice(0, 30)

    await reply(`📢 Tagging ${targets.length} active users...`)

    const text =
      `📢 *Active Members Ping*\n\n` +
      targets.map(u => `🟢 @${u.split("@")[0]}`).join("\n")

    await sock.sendMessage(jid, {
      text,
      mentions: targets
    })

  } catch (e) {
    console.log("tagonline error:", e)
    reply("❌ Failed to fetch active users")
  }
},
    hidetag: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  try {
    const meta = await sock.groupMetadata(jid)

    const members = meta.participants
      .map(p => p.id)
      .filter(Boolean)

    if (!members.length) return reply("❌ No members found")

    const text = args.length > 0
      ? args.join(" ")
      : "📢 Announcement"

    // 📤 send hidetag message
    await sock.sendMessage(jid, {
      text,
      mentions: members
    })

    // ⏱️ delete command after 3 seconds
    setTimeout(async () => {
      try {
        await sock.sendMessage(jid, {
          delete: msg.key
        })
      } catch (e) {
        console.log("Command auto-delete failed:", e)
      }
    }, 3000)

  } catch (e) {
    console.log("Hidetag Error:", e)
    reply("❌ Failed to send hidden tag")
  }
},

      lock: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  try {
    await sock.groupSettingUpdate(jid, "announcement")
    reply("🔒 Group locked (admins only)")
  } catch {
    reply("❌ Failed to lock group")
  }
},

unlock: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  try {
    await sock.groupSettingUpdate(jid, "not_announcement")
    reply("🔓 Group unlocked (everyone can chat)")
  } catch {
    reply("❌ Failed to unlock group")
  }
},

// ================= GROUP OPEN TEMP =================
opentemp: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  const minutes = parseInt(args[0])
  if (!minutes || minutes < 1) {
    return reply("❌ Usage: .opentemp <minutes>")
  }

  await react("🔓")

  await sock.groupSettingUpdate(jid, "not_announcement")

  reply(`🔓 Group opened for ${minutes} minute(s)`)

  setTimeout(async () => {
    try {
      await sock.groupSettingUpdate(jid, "announcement")
      reply("🔒 Group auto-locked again")
    } catch (e) {
      console.log("TEMP LOCK ERROR:", e)
    }
  }, minutes * 60000)
},

// ================= GROUP CLOSE TEMP =================
closetemp: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  const minutes = parseInt(args[0])
  if (!minutes || minutes < 1) {
    return reply("❌ Usage: .closetemp <minutes>")
  }

  await react("🔒")

  await sock.groupSettingUpdate(jid, "announcement")

  reply(`🔒 Group locked for ${minutes} minute(s)`)

  setTimeout(async () => {
    try {
      await sock.groupSettingUpdate(jid, "not_announcement")
      reply("🔓 Group auto-opened again")
    } catch (e) {
      console.log("TEMP OPEN ERROR:", e)
    }
  }, minutes * 60000)
},

// ===== SET OPEN TIME =====
setopen: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  const time = args[0]

  // Format HH:MM (24hr)
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return reply("❌ Usage: .setopen 06:00")
  }

  await react("🌅")

  if (!GROUP_SCHEDULES[jid]) GROUP_SCHEDULES[jid] = {}

  GROUP_SCHEDULES[jid].open = time
  GROUP_SCHEDULES[jid].enabled = true

  saveGroupSchedules()

  reply(
`🌅 *GROUP AUTO-OPEN SET*

🔓 Open Time: ${time}
🕒 Timezone: Africa/Lagos`
  )
},

// ===== SET CLOSE TIME =====
setclose: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  const time = args[0]

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return reply("❌ Usage: .setclose 22:00")
  }

  await react("🌑")

  if (!GROUP_SCHEDULES[jid]) GROUP_SCHEDULES[jid] = {}

  GROUP_SCHEDULES[jid].close = time
  GROUP_SCHEDULES[jid].enabled = true

  saveGroupSchedules()

  reply(
`🌙 *GROUP AUTO-CLOSE SET*

🔒 Close Time: ${time}
🕒 Timezone: Africa/Lagos`
  )
},

// ===== VIEW SCHEDULE =====
schedule: async () => {
  if (!isGroup) return reply("❌ Group only")

  await react("📅")

  const schedule = GROUP_SCHEDULES[jid]

  if (!schedule || (!schedule.open && !schedule.close)) {
    return reply("❌ No schedule set for this group")
  }

  reply(
`📅 *GROUP SCHEDULE SETTINGS*

🌅 Open: ${schedule.open || "Not set"}
🌙 Close: ${schedule.close || "Not set"}

⚙️ Status: ${schedule.enabled ? "✅ Active" : "❌ Disabled"}
🕒 Timezone: Africa/Lagos`
  )
},

// ===== DISABLE SCHEDULE =====
scheduleoff: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  await react("⛔")

  if (!GROUP_SCHEDULES[jid]) {
    return reply("❌ No schedule found")
  }

  GROUP_SCHEDULES[jid].enabled = false
  saveGroupSchedules()

  reply("⛔ Group schedule disabled")
},

// ===== ENABLE SCHEDULE =====
scheduleon: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  await react("✅")

  if (!GROUP_SCHEDULES[jid]) {
    return reply("❌ No schedule found")
  }

  GROUP_SCHEDULES[jid].enabled = true
  saveGroupSchedules()

  reply("✅ Group schedule enabled")
},

// ===== DELETE SCHEDULE =====
delschedule: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  await react("🗑️")

  delete GROUP_SCHEDULES[jid]
  saveGroupSchedules()

  reply("🗑️ Group schedule deleted")
},


// ==== GROUP MANAGEMENT =====
setname: async () => {
    if (!isGroup) return reply("❌ Group only")
    if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

    const newName = args.join(" ")
    if (!newName) return reply("❌ Provide new group name")

    try {
      await sock.groupUpdateSubject(jid, newName)
      reply("✏️ Group name updated successfully")
    } catch (e) {
      console.log("SETNAME ERROR:", e)
      reply("❌ Failed to update group name")
    }
  },

  setdesc: async () => {
    if (!isGroup) return reply("❌ Group only")
    if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

    const newDesc = args.join(" ")
    if (!newDesc) return reply("❌ Provide new description")

    try {
      await sock.groupUpdateDescription(jid, newDesc)
      reply("📝 Group description updated successfully")
    } catch (e) {
      console.log("SETDESC ERROR:", e)
      reply("❌ Failed to update group description")
    }
  },

groupinfo: async () => {
  if (!isGroup) return reply("❌ Group only")
    if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  try {
    const meta = await sock.groupMetadata(jid)

    const admins = meta.participants
      .filter(p => p.admin)
      .map(p => p.id)

    const owner = meta.owner || "Unknown"

    const text =
`📛 ${meta.subject}

👥 Members: ${meta.participants.length}
👑 Owner: @${owner.split("@")[0]}
🛡️ Admins: ${admins.length}

📝 Description:
${meta.desc || "None"}

👑 Admin List:
${admins.map((a, i) => ` ${i + 1}. @${a.split("@")[0]}`).join("\n")}
`

    await sock.sendMessage(jid, {
      text,
      mentions: [owner, ...admins].filter(Boolean)
    })

  } catch (e) {
    console.log(e)
    reply("❌ Failed to fetch group info")
  }
},

grouplink: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  try {
    const code = await sock.groupInviteCode(jid)

    if (!code || typeof code !== "string") {
      return reply("❌ Failed to get invite link. Make sure bot is admin.")
    }

    const link = `https://chat.whatsapp.com/${code}`

    await sock.sendMessage(jid, {
      text: `🔗 *Group Invite Link*\n\n${link}`
    })

  } catch (e) {
    console.log("grouplink error:", e)
    reply("❌ Could not fetch group invite link (bot may not be admin)")
  }
},

revoke: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")
  await sock.groupRevokeInvite(jid)
  reply("🔄 Group link reset successful")
},

// ================= ADD USER =================
add: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .add @user | reply | 2348012345678")
  }

  // Auto-fix Nigerian local format (080... → 23480...)
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const user = normalizeJid(number + "@s.whatsapp.net")

  if (!user) return reply("❌ Invalid number")

  try {
    await sock.groupParticipantsUpdate(jid, [user], "add")

    reply(`✅ Added @${number} to the group`, {
      mentions: [user]
    })
  } catch (e) {
    console.log("Add error:", e)

    reply(`❌ Failed to add @${number}`, {
      mentions: [user]
    })
  }
},

// ================= INVITE USER =================
invite: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .invite @user | reply | 2348012345678")
  }

  // Auto-fix Nigerian local format (080... → 23480...)
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = normalizeJid(number + "@s.whatsapp.net")

  if (!target) return reply("❌ Invalid number")

  try {
    const code = await sock.groupInviteCode(jid)
    const link = "https://chat.whatsapp.com/" + code

    await sock.sendMessage(target, {
      text: `👋 You are invited to join this group:\n\n🔗 ${link}`
    })

    reply(`✅ Invite link sent to @${number}`, {
      mentions: [target]
    })
  } catch (e) {
    console.log("Invite error:", e)

    reply(`❌ Failed to send invite to @${number}`, {
      mentions: [target]
    })
  }
},

// ================= KICK USER =================
kick: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner && !isAdmin) return reply("❌ Admin or Bot owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .kick @user | reply | 2348012345678")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = normalizeJid(number + "@s.whatsapp.net")

  if (!target) return reply("❌ Invalid user")

  try {
    await sock.groupParticipantsUpdate(jid, [target], "remove")

    reply(`👢 Removed @${number} from group`, {
      mentions: [target]
    })
  } catch (e) {
    console.log("Kick error:", e)

    reply(`❌ Failed to remove @${number}`, {
      mentions: [target]
    })
  }
},

// ================= PROMOTE USER =================
promote: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .promote @user | reply | 2348012345678")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = normalizeJid(number + "@s.whatsapp.net")

  if (!target) return reply("❌ Invalid user")

  try {
    await sock.groupParticipantsUpdate(jid, [target], "promote")

    reply(`👮 @${number} is now an admin`, {
      mentions: [target]
    })
  } catch (e) {
    console.log("Promote error:", e)

    reply(`❌ Failed to promote @${number}`, {
      mentions: [target]
    })
  }
},

// ================= DEMOTE USER =================
demote: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  // supports mention, reply, or raw number
  let number =
    getTarget()?.split("@")[0] ||
    args[0]?.replace(/\D/g, "")

  if (!number) {
    return reply("❌ Usage: .demote @user | reply | 2348012345678")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = normalizeJid(number + "@s.whatsapp.net")

  if (!target) return reply("❌ Invalid user")

  try {
    await sock.groupParticipantsUpdate(jid, [target], "demote")

    reply(`⬇️ @${number} removed as admin`, {
      mentions: [target]
    })
  } catch (e) {
    console.log("Demote error:", e)

    reply(`❌ Failed to demote @${number}`, {
      mentions: [target]
    })
  }
},

approve: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")
  const target = normalizeJid(getTarget())
  if (!target) return reply("Mention user")

  try {
    await sock.groupRequestParticipantsUpdate(jid, [target], "approve")
    reply("✅ Request approved")
  } catch {
    reply("❌ Failed (ensure join approval is ON)")
  }
},

approveall: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  try {
    const requests = await sock.groupRequestParticipantsList(jid)

    if (!requests || requests.length === 0) {
      return reply("❌ No pending join requests")
    }

    const users = requests.map(u => u.jid)

    await sock.groupRequestParticipantsUpdate(jid, users, "approve")

    reply(`✅ Approved ${users.length} join request(s)`)
  } catch (e) {
    console.log(e)
    reply("❌ Failed to approve requests (maybe join approval is OFF)")
  }
},

reject: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")
  const target = normalizeJid(getTarget())
  if (!target) return reply("Mention user")

  try {
    await sock.groupRequestParticipantsUpdate(jid, [target], "reject")
    reply("❌ Request rejected")
  } catch {
    reply("❌ Failed (ensure join approval is ON)")
  }
},

// ================= ANTI STATUS =================
antistatus: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  group_settings.antistatus = args[0] === "on"
  saveGroupSettings()

  reply(`🚫 Anti-status ${group_settings.antistatus ? "ON" : "OFF"}`)
},

antistatusmention: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  group_settings.antistatus_mention = args[0] === "on"
  saveGroupSettings()

  reply(`📢 Anti-status mention ${group_settings.antistatus_mention ? "ON" : "OFF"}`)
},

delete: async () => {
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  const quoted = msg.message?.extendedTextMessage?.contextInfo

  if (!quoted) return reply("❌ Reply to a message to delete")

  const key = {
    remoteJid: jid,
    fromMe: false,
    id: quoted.stanzaId,
    participant: quoted.participant
  }

  try {
    await sock.sendMessage(jid, { delete: key })
    reply("🗑️ Message deleted")
  } catch (e) {
    console.log(e)
    reply("❌ Failed to delete message")
  }
},

del: async () => {
  if (!isAdmin && !isOwner) return reply("❌ Admin or Bot owner only")

  const quoted = msg.message?.extendedTextMessage?.contextInfo

  if (!quoted) return reply("Reply to message")

  try {
    await sock.sendMessage(jid, {
      delete: {
        remoteJid: jid,
        fromMe: false,
        id: quoted.stanzaId,
        participant: quoted.participant
      }
    })
  } catch (e) {
    console.log(e)
    reply("❌ Cannot delete (WhatsApp limitation)")
  }
},

alive: async () => {
  if (!isOwner) return reply("❌ Owner only")

  const uptime = Date.now() - BOT_STATS.startTime
  const seconds = Math.floor(uptime / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  reply(`
🤖 GIBBORLEE BOT STATS

⏱️ Uptime: ${hours}h ${minutes % 60}m ${seconds % 60}s
💬 Messages: ${BOT_STATS.messages}
⚡ Commands used: ${BOT_STATS.commands}

📊 Status: ACTIVE
`)
},

mode: async () => {
  if (!isOwner) return reply("❌ Owner only")

  const current = settings.mode || "public"
  const newMode = args[0]?.toLowerCase()

  if (!newMode) {
    return reply(
`🔐 𝐁𝐎𝐓 𝐌𝐎𝐃𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋

🌍 *PUBLIC MODE*
➤ Everyone can use the bot
➤ Best for open groups & communities

🔒 *PRIVATE MODE*
➤ Only bot owner can use commands
➤ Maximum security mode

👥 *GROUP MODE*
➤ Works only in group chats
➤ Ignores all DMs

💬 *DM MODE*
➤ Works only in private chats
➤ Ignores all groups

⚡ *AUTO MODE*
➤ Smart switching system:
   • Groups → Public access
   • DMs → Owner-only access

━━━━━━━━━━━━━━━━━━━━
📊 Current Mode: *${current.toUpperCase()}*

Usage:
.mode public
.mode private
.mode group
.mode dm
.mode auto`
    )
  }

  const valid = ["public", "private", "group", "dm", "auto"]

  if (!valid.includes(newMode)) {
    return reply("❌ Invalid mode\nUse: public / private / group / dm / auto")
  }

  settings.mode = newMode
  saveSettings()

  reply(`✅ Bot mode changed to: *${newMode.toUpperCase()}*`)
},

whoami: async () => {
  reply(`👤 Your JID:\n${sender}`)
},

ping: async () => {
  if (!isOwner) return reply("❌ Owner only")
  const start = Date.now()

  const sent = await sock.sendMessage(jid, {
    text: "🏓 Pinging..."
  })

  const end = Date.now()
  const speed = end - start

  await sock.sendMessage(jid, {
    text:
`🏓 *PONG!. I AM ACTIVE TO ASSIST YOU*

⚡ Speed: ${speed}ms
🤖 Status: Online
📡 Server: Active`
  }, { quoted: msg })
},

// ============= STATUS FETCH =============
getstatus: async () => {
  if (!isOwner) return reply("❌ Owner only")
  try {
    const quoted =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
      msg.message?.imageMessage?.contextInfo?.quotedMessage ||
      msg.message?.videoMessage?.contextInfo?.quotedMessage

    if (!quoted) {
      return reply(
        "❌ Reply to a WhatsApp status (image/video/text) with .getstatus"
      )
    }

    // ===== STATUS TEXT =====
    if (quoted.conversation) {
      return reply(`📥 STATUS TEXT:\n\n${quoted.conversation}`)
    }

    if (quoted.extendedTextMessage?.text) {
      return reply(`📥 STATUS TEXT:\n\n${quoted.extendedTextMessage.text}`)
    }

    // ===== STATUS IMAGE =====
    if (quoted.imageMessage) {
      const stream = await downloadContentFromMessage(
        quoted.imageMessage,
        "image"
      )

      let buffer = Buffer.from([])
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
      }

      await sock.sendMessage(
        jid,
        {
          image: buffer,
          caption: quoted.imageMessage.caption || "📥 Extracted status image"
        },
        { quoted: msg }
      )

      return
    }

    // ===== STATUS VIDEO =====
    if (quoted.videoMessage) {
      const stream = await downloadContentFromMessage(
        quoted.videoMessage,
        "video"
      )

      let buffer = Buffer.from([])
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
      }

      await sock.sendMessage(
        jid,
        {
          video: buffer,
          caption: quoted.videoMessage.caption || "📥 Extracted status video"
        },
        { quoted: msg }
      )

      return
    }

    return reply("❌ Unsupported status type")

  } catch (e) {
    console.log("GETSTATUS ERROR:", e)

    return reply(
`❌ Failed to extract status

Reason:
${e.message || "Unknown error"}`
    )
  }
},

// ===== PIN / UNPIN MESSAGE (GROUP + DM) =====
pin: async () => {
   if (!isOwner) return reply("❌ Owner only")

  const quoted = msg.message?.extendedTextMessage?.contextInfo
  if (!quoted?.stanzaId) {
    return reply("❌ Reply to the message you want to pin")
  }

  try {
    // 🔥 Works in both group & DM
    await sock.chatModify(
      {
        pin: true,
        lastMessages: [
          {
            key: {
              remoteJid: jid,
              fromMe: quoted.participant
                ? normalizeJid(quoted.participant) === cleanSender
                : false,
              id: quoted.stanzaId,
              participant: quoted.participant || undefined
            },
            messageTimestamp: quoted.expiration || Date.now()
          }
        ]
      },
      jid
    )

    reply("📌 Message pinned successfully")
  } catch (e) {
    console.log("PIN ERROR:", e)
    reply("❌ Failed to pin message")
  }
},

unpin: async () => {
 if (!isOwner) return reply("❌ Owner only")

  const quoted = msg.message?.extendedTextMessage?.contextInfo
  if (!quoted?.stanzaId) {
    return reply("❌ Reply to the pinned message you want to unpin")
  }

  try {
    await sock.chatModify(
      {
        pin: false,
        lastMessages: [
          {
            key: {
              remoteJid: jid,
              fromMe: quoted.participant
                ? normalizeJid(quoted.participant) === cleanSender
                : false,
              id: quoted.stanzaId,
              participant: quoted.participant || undefined
            },
            messageTimestamp: quoted.expiration || Date.now()
          }
        ]
      },
      jid
    )

    reply("📍 Message unpinned successfully")
  } catch (e) {
    console.log("UNPIN ERROR:", e)
    reply("❌ Failed to unpin message")
  }
},



      // ===== MENU =====
      
menu: async () => {
  

  const header = getHeader()
  
 const from = msg.key.remoteJid 
 const userJid = msg.key.participant || msg.key.remoteJid

  const pushName =
    msg.pushName ||
    msg.name ||
    "Unknown User"

 // ===== ROLE SYSTEM =====
  let role = "👤 User"

  try {
    if (from.endsWith("@g.us")) {
      const metadata = await sock.groupMetadata(from)

      const participant = metadata.participants.find(
        p => p.id === userJid
      )

      if (participant) {
        if (participant.admin === "superadmin") {
          role = "👑 Group Owner"
        } else if (participant.admin === "admin") {
          role = "🛡️ Group Admin"
        } else {
          role = "👤 Member"
        }
      }
    }
  } catch {
    role = "👤 User"
  }

// 📸 RANDOM SMALL MENU IMAGE
const randomImage = `https://picsum.photos/seed/menu${Date.now()}/500/300`

  // 📊 SYSTEM INFO
  const uptime = process.uptime()
  const uptimeText = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`

  const memory = (process.memoryUsage().rss / 1024 / 1024).toFixed(2)

  const totalRAM = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2)
  const freeRAM = (os.freemem() / 1024 / 1024 / 1024).toFixed(2)

  const time = moment().tz("Africa/Lagos").format("HH:mm:ss")
  const date = moment().tz("Africa/Lagos").format("DD/MM/YYYY")

  const ownerText = BOT_OWNERS.length
    ? BOT_OWNERS.map(o => `• @${o.split("@")[0]}`).join("\n")
    : "• No owners set"

  // 🌅 GREETING SYSTEM
  const hour = new Date().getHours()
  const greet =
    hour < 12 ? "🌅 Good Morning" :
    hour < 16 ? "🌞 Good Afternoon" :
                "🌙 Good Evening"

 if (!isOwner) return reply("❌ Owner only")
  

  // 📜 MENU TEXT

  let text = `
${header}
╰━━━━━━━━━━━━━━━━━━━╯

${greet}, ${pushName} 👋
How can I be of help to you now?
I am glad to help you out

━━━━━━━━━━━━━━━━━━━━
👑 *OWNER PANEL*
╭───────────────╮
│ 👥 Owners: ${BOT_OWNERS.length}
╰───────────────╯
${ownerText}

━━━━━━━━━━━━━━━━━━━━
👤 *USER PROFILE*
╭───────────────╮
│ 🏷️ Name: ${pushName}
│ 🎭 Role: ${role}
╰───────────────╯

━━━━━━━━━━━━━━━━━━━━
⏰ *TIME & DATE*
╭───────────────╮
│ 🕒 ${time}
│ 📅 ${date}
╰───────────────╯

━━━━━━━━━━━━━━━━━━━━
📊 *SYSTEM STATS*
╭───────────────╮
│ ⚡ Uptime: ${uptimeText}
│ 💾 RAM: ${memory} MB
│ 🧠 Total: ${totalRAM} GB
│ 🧹 Free: ${freeRAM} GB
╰───────────────╯
`
const grouped = groupCommands(COMMANDS)

  for (const [title, cmds] of Object.entries(grouped)) {
    if (!cmds.length) continue

    text += `
━━━━━━━━━━━━━━━━━━━━
╭─「 ${title} 」─╮
${cmds.join("\n")}
╰────────────────────╯
`
  }

  text += `
━━━━━━━━━━━━━━━━━━━━
╔════════════════════════════╗
║ ✨ Clean • Smart • Powerful ✨ 
║   Your wish is my command 🤭   
╚════════════════════════════╝
`
 // ===== SEND MENU WITH WORKING IMAGE =====
return sock.sendMessage(from, {
   image: { url: randomImage }, 
   caption: text, 
   mentions: BOT_OWNERS 
  }, { quoted: msg }
) 
}
}
    // ================= EXECUTION =================
if (commands[cmd]) {
  try {
    BOT_STATS.commands++

    // ✅ REACT FIRST
 
    const emoji = COMMAND_REACTIONS[cmd]
     if (emoji) {
      await react(emoji)
    }

    // ⏳ small delay ensures reaction shows first (important on WhatsApp)
    await new Promise(r => setTimeout(r, 200))

   // ✅ RUN COMMAND
    await commands[cmd]()

  } catch (e) {
    console.log(`❌ Command Error (${cmd}):`, e)

    await react("❌")
    return reply("❌ Command execution failed")
  }

} else {
  await react("❓")
  return reply("❌ Unknown command")
}
  })

return sock
} catch (err) {
    console.log("🔥 Start error:", err)

    if (!reconnecting) {
      reconnecting = true
      setTimeout(() => start(session), 5000)
    }

}
}

// =================  SESSION =================
;["session1", "session2"].forEach(start)