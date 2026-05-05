import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
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
import fetch from "node-fetch"


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

// ================= GLOBAL STORAGE =================
global.STATUS_DB = global.STATUS_DB || []
global.STATUS_HASH = new Set()

// ================= RUNTIME FORMATTER =================

function formatRuntime(ms) {
  if (!ms || ms < 0) return "0s"

  const sec = Math.floor(ms / 1000) % 60
  const min = Math.floor(ms / (1000 * 60)) % 60
  const hr = Math.floor(ms / (1000 * 60 * 60))

  return `${hr}h ${min}m ${sec}s`
}

// ================= DM AUTO REPLY SYSTEM (OWNER ONLY CONTROL) =================

global.DM_AUTO_REPLY = global.DM_AUTO_REPLY || {
  enabled: true,

words: {
  hello: ["Hello 👋", "Hi 😄", "Hey there 😊", "Yo 👋", "Hey buddy 😎"],
  hi: ["Hello 😄", "Hi friend 👋", "Hey 👋", "Hi there 😊"],
  hey: ["Hey 👋", "Hey there 😎", "Yo 😄"],
  morning: ["Good morning ☀️", "Morning 👋", "Rise and shine 🌞"],
  afternoon: ["Good afternoon ☀️", "Hope your day is going great 😄"],
  evening: ["Good evening 🌆", "Evening 👋"],
  night: ["Good night 🌙", "Sleep well 😴", "Sweet dreams ✨"],
  bot: ["I'm here 🤖", "Yes? 👀", "Bot active ⚡"],
  thanks: ["Welcome 😊", "No problem 👍", "Anytime 😄"],
  thankyou: ["You're welcome 😊", "Happy to help 💙"],
  ok: ["Alright 👍", "Okay 👌", "Sure 😄"],
  yes: ["Nice 😎", "Alright 🔥"],
  no: ["Okay 👌", "No problem 😄"],
  lol: ["😂", "Haha 😆", "Lmao 🤣"],
  bye: ["Bye 👋", "See you 😄", "Take care 💙"],
  help: ["Type .menu for commands 📋", "Need help? Use .menu 👀"],

  owner: ["👑 My owner is amazing", "👑 Respect the owner", "I was created by Gibbor AKA GibborLee🧠"],
  menu: ["📋 Type .menu to explore commands"],
  ping: ["🏓 Pong!"],
  alive: ["💚 I'm active and running"],

  love: ["❤️ Love you too", "💖 Sending love"],
  miss: ["🥹 Aww, I’m here"],
  sad: ["💙 Stay strong", "🥺 Hope things get better"],
  happy: ["😄 That’s awesome!", "🎉 Nice!"],
  angry: ["😅 Calm down", "🧘 Relax a little"],

  who: ["🤖 I'm your smart bot assistant"],
  what: ["👀 Can you explain more?"],
  where: ["📍 Depends, tell me more"],
  when: ["⏳ Soon maybe 😄"],
  why: ["🤔 Good question"],

  joke: ["😂 Why did the bot cross the chat? To reply you!"],
  funny: ["🤣 You’re funny too"],
  bored: ["🎮 Try .menu for fun commands"],
  sleep: ["😴 Go get some rest"],
  food: ["🍔 I wish bots could eat"],
  hungry: ["🍕 Go grab something tasty"],
  music: ["🎵 Music makes everything better"],
  game: ["🎮 Games are fun"],
  school: ["📚 Study hard"],
  exam: ["📝 Good luck!"],
  work: ["💼 Stay productive"],

  whatsapp: ["💬 Best chat app 😎"],
  group: ["👥 Groups can be fun"],
  admin: ["👮 Respect admins"],
  sticker: ["🎭 Stickers are cool"],
  viewonce: ["👁️ I can help with that 😎"],

  good: ["😄 Nice!", "🔥 Awesome"],
  bad: ["😬 Ouch"],
  cool: ["😎 Very cool"],
  wow: ["😮 Wow indeed"],
  nice: ["💯 Nice one"],
  bro: ["😎 Bro!"],
  sis: ["😊 Sis!"],
  dude: ["😎 Yo dude"],
  guy: ["👋 Hey"],
  girl: ["😊 Hello"],

  test: ["✅ Test successful"],
  check: ["👀 Checking..."],
  status: ["📊 Status: Active"],
  update: ["⚡ Updated"],
  send: ["📩 Sending..."],
  wait: ["⏳ Please wait"],
  fast: ["⚡ Super fast"],
  slow: ["🐢 Taking it slow"],

  Nigeria: ["🇳🇬 Naija no dey carry last"],
  Lagos: ["🌆 Lagos vibes"],
  Abuja: ["🏛️ Abuja strong"],
  Africa: ["🌍 Africa to the world"],

  God: ["🙏 Stay blessed"],
  prayer: ["🙏 Amen"],
  church: ["⛪ Blessings"],
  bless: ["✨ Bless you"],

  money: ["💸 Secure the bag"],
  rich: ["🤑 Big money vibes"],
  poor: ["💙 Better days ahead"],

  phone: ["📱 Phones are life"],
  android: ["🤖 Android gang"],
  iphone: ["🍎 Premium vibes"],

  internet: ["🌐 Connected"],
  wifi: ["📶 Signal strong"],
  network: ["📡 Stay connected"],

  friend: ["😊 Friends matter"],
  family: ["🏡 Family first"],
  mom: ["❤️ Moms are special"],
  dad: ["💪 Dads provides for the family"],

  default: [
    "🤖 I'm currently unavailable right now.",
    "💬 Message received.",
    "⚡ I'll reply soon.",
    "👋 Thanks for your message.",
    "📩 Your message has been noted.",
    "😊 I’ll respond when available."
  ]
}}

// ================= RANDOM PICKER =================

function pickRandom(arr = []) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ================= SMART AUTO REPLY ENGINE =================

function getSmartAutoReply(message = "") {
  const text = String(message || "").toLowerCase()

  if (!text) {
    return pickRandom(global.DM_AUTO_REPLY.defaultReplies)
  }

  for (const key of Object.keys(global.DM_AUTO_REPLY.words)) {
    if (typeof key === "string" && text.includes(key)) {
      const arr = global.DM_AUTO_REPLY.words[key]
      return pickRandom(arr)
    }
  }

  return pickRandom(global.DM_AUTO_REPLY.defaultReplies)
}

// ================= CONFIG =================
const PREFIX = "!"
const BOT_STATS = {
  startTime: Date.now(),
  messages: 0,
  commands: 0
}

function getUserRole({
  isOwner,
  isAdmin,
  isBot,
  isGroup
}) {

  // 🤖 Bot
  if (isBot) {
    return "🤖 Bot"
  }

  // 👑 Owner
  if (isOwner) {
    return "👑 Owner"
  }

  // 🛡️ Group Admin
  if (isGroup && isAdmin) {
    return "🛡️ Group Admin"
  }

  // 👤 Group Member
  if (isGroup) {
    return "👤 Group Member"
  }

  // 💬 Private User
  return "💬 Private User"
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

const PREMIUM_MENU_SECTIONS = {
  "🛡️ PROTECTION": [
    "antilink",
    "antibadword",
    "antidelete",
    "antistatus",
    "antistatusmention"
  ],

  "👥 ADMIN": [
    "kick",
    "add",
    "invite",
    "promote",
    "demote",
    "tagall",
    "hidetag",
    "tagonline"
  ],

  "⚙️ GROUP": [
    "setname",
    "setdesc",
    "groupinfo",
    "grouplink",
    "revoke",
    "lock",
    "unlock",
    "mute",
    "unmute",
    "mutelist"
  ],

  "🖇️ JOIN REQUESTS":[
    "approve",
    "approveall",
    "reject",
    "rejectall",
    "requests"
  ],

  "🕒 SCHEDULE": [
    "setopen",
    "setclose",
    "schedule",
    "scheduleon",
    "scheduleoff"
  ],

  "🎨 MEDIA": [
    "getstatus",
    "vv",
    "pp",
    "sticker",
    "stickergif",
    "memesticker",
    "captionsticker",
    "stickerpack",
     "statuslist",
  "autostatus",
  "statusfilter",
  "statusclear",
  ],

  "👑 OWNER": [
    "addowner",
    "delowner",
    "owners",
    "restart",
    "shutdown",
    "broadcast",
    "ban",
    "unban",
    "banned",
  ],

  "💬 AUTO REPLY":[
    "autoreplyon",
    "autoreplyoff",
    "addreply",
    "delreply",
    "listreply",
  ],

  "⚠️ WARN": [
    "warn",
    "warnlist",
    "warninfo",
    "unwarn",
    "resetwarns"
  ],

  "📦 STICKER PACK": [
    "packcreate",
    "packadd",
    "packview",
    "packlist",
    "packdelete",
    "packsend"
  ],

  "ℹ️ INFO": [
    "runtime",
    "help",
    "mode",
    "alive",
    "whoami",
    "stats",
    "ping",
    "test",
    "nettest",
  ]
}

const COMMAND_DESCRIPTIONS = {
  // 🛡️ PROTECTION
  antilink: "🚫 𝘽𝙡𝙤𝙘𝙠 𝙒𝙝𝙖𝙩𝙨𝘼𝙥𝙥 & 𝙚𝙭𝙩𝙚𝙧𝙣𝙖𝙡 𝙡𝙞𝙣𝙠𝙨",
  antibadword: "🧼 𝘼𝙪𝙩𝙤-𝙧𝙚𝙢𝙤𝙫𝙚 𝙤𝙛𝙛𝙚𝙣𝙨𝙞𝙫𝙚 𝙬𝙤𝙧𝙙𝙨",
  antidelete: "🧠 𝙍𝙚𝙘𝙤𝙫𝙚𝙧 𝙙𝙚𝙡𝙚𝙩𝙚𝙙 𝙢𝙚𝙨𝙨𝙖𝙜𝙚𝙨",
  antistatus: "👁️ 𝘽𝙡𝙤𝙘𝙠 𝙨𝙩𝙖𝙩𝙪𝙨 𝙫𝙞𝙚𝙬𝙞𝙣𝙜",
  antistatusmention: "📢 𝘽𝙡𝙤𝙘𝙠 𝙨𝙩𝙖𝙩𝙪𝙨 𝙢𝙚𝙣𝙩𝙞𝙤𝙣𝙨",

// 👥 ADMIN
  kick: "👢 𝙍𝙚𝙢𝙤𝙫𝙚 𝙖 𝙪𝙨𝙚𝙧 𝙛𝙧𝙤𝙢 𝙜𝙧𝙤𝙪𝙥",
  add: "➕ 𝘼𝙙𝙙 𝙪𝙨𝙚𝙧 𝙩𝙤 𝙜𝙧𝙤𝙪𝙥",
  invite: "🔗 𝙎𝙚𝙣𝙙 𝙜𝙧𝙤𝙪𝙥 𝙞𝙣𝙫𝙞𝙩𝙚 𝙡𝙞𝙣𝙠",
  promote: "⬆️ 𝙋𝙧𝙤𝙢𝙤𝙩𝙚 𝙪𝙨𝙚𝙧 𝙩𝙤 𝙖𝙙𝙢𝙞𝙣",
  demote: "⬇️ 𝙍𝙚𝙢𝙤𝙫𝙚 𝙖𝙙𝙢𝙞𝙣 𝙥𝙧𝙞𝙫𝙞𝙡𝙚𝙜𝙚𝙨",
  tagall: "📣 𝙈𝙚𝙣𝙩𝙞𝙤𝙣 𝙖𝙡𝙡 𝙢𝙚𝙢𝙗𝙚𝙧𝙨",
  hidetag: "👻 𝙃𝙞𝙙𝙙𝙚𝙣 𝙜𝙧𝙤𝙪𝙥 𝙢𝙚𝙣𝙩𝙞𝙤𝙣",
  tagonline: "🟢 𝙏𝙖𝙜 𝙖𝙘𝙩𝙞𝙫𝙚 𝙢𝙚𝙢𝙗𝙚𝙧𝙨",

  // ⚙️ GROUP
  setname: "✏️ 𝘾𝙝𝙖𝙣𝙜𝙚 𝙜𝙧𝙤𝙪𝙥 𝙣𝙖𝙢𝙚",
  setdesc: "📝 𝙐𝙥𝙙𝙖𝙩𝙚 𝙜𝙧𝙤𝙪𝙥 𝙙𝙚𝙨𝙘",
  groupinfo: "📊 𝙑𝙞𝙚𝙬 𝙜𝙧𝙤𝙪𝙥 𝙖𝙣𝙖𝙡𝙮𝙩𝙞𝙘𝙨",
  grouplink: "🔗 𝙂𝙚𝙩 𝙞𝙣𝙫𝙞𝙩𝙚 𝙡𝙞𝙣𝙠",
  revoke: "♻️ 𝙍𝙚𝙨𝙚𝙩 𝙞𝙣𝙫𝙞𝙩𝙚 𝙡𝙞𝙣𝙠",
  lock: "🔒 𝙇𝙤𝙘𝙠 𝙜𝙧𝙤𝙪𝙥",
  unlock: "🔓 𝙐𝙣𝙡𝙤𝙘𝙠 𝙜𝙧𝙤𝙪𝙥",
  mute: "🔇 𝙈𝙪𝙩𝙚 𝙖 𝙪𝙨𝙚𝙧",
  unmute: "🔊 𝙐𝙣𝙢𝙪𝙩𝙚 𝙖 𝙪𝙨𝙚𝙧",
  mutelist: "📋 𝙑𝙞𝙚𝙬 𝙢𝙪𝙩𝙚𝙙 𝙪𝙨𝙚𝙧𝙨",

  //🖇️  JOIN REQUESTS
  approve: "✅ 𝘼𝙥𝙥𝙧𝙤𝙫𝙚 𝙟𝙤𝙞𝙣 𝙧𝙚𝙦𝙪𝙚𝙨𝙩",
  approveall: "🎉 𝘼𝙥𝙥𝙧𝙤𝙫𝙚 𝙖𝙡𝙡 𝙟𝙤𝙞𝙣 𝙧𝙚𝙦𝙪𝙚𝙨𝙩𝙨",
  reject: "🚫 𝙍𝙚𝙟𝙚𝙘𝙩 𝙟𝙤𝙞𝙣 𝙧𝙚𝙦𝙪𝙚𝙨𝙩",
  rejectall: "⛔ 𝙍𝙚𝙟𝙚𝙘𝙩 𝙖𝙡𝙡 𝙟𝙤𝙞𝙣 𝙧𝙚𝙦𝙪𝙚𝙨𝙩𝙨",
  requests: "📨 𝙑𝙞𝙚𝙬 𝙥𝙚𝙣𝙙𝙞𝙣𝙜 𝙧𝙚𝙦𝙪𝙚𝙨𝙩𝙨",

  // 🕒 SCHEDULE
  setopen: "🌅 𝙎𝙚𝙩 𝙙𝙖𝙞𝙡𝙮 𝙤𝙥𝙚𝙣 𝙩𝙞𝙢𝙚",
  setclose: "🌙 𝙎𝙚𝙩 𝙙𝙖𝙞𝙡𝙮 𝙘𝙡𝙤𝙨𝙚 𝙩𝙞𝙢𝙚",
  schedule: "📅 𝙑𝙞𝙚𝙬 𝙜𝙧𝙤𝙪𝙥 𝙨𝙘𝙝𝙚𝙙𝙪𝙡𝙚",
  scheduleon: "✅ 𝙀𝙣𝙖𝙗𝙡𝙚 𝙨𝙘𝙝𝙚𝙙𝙪𝙡𝙚",
  scheduleoff: "⛔ 𝘿𝙞𝙨𝙖𝙗𝙡𝙚 𝙨𝙘𝙝𝙚𝙙𝙪𝙡𝙚",

  // 🎨 MEDIA
  getstatus: "📥 𝙀𝙭𝙩𝙧𝙖𝙘𝙩 𝙒𝙝𝙖𝙩𝙨𝘼𝙥𝙥 𝙨𝙩𝙖𝙩𝙪𝙨",
  vv: "👁️ 𝙍𝙚𝙘𝙤𝙫𝙚𝙧 𝙫𝙞𝙚𝙬-𝙤𝙣𝙘𝙚",
  pp: "🖼️ 𝙃𝘿 𝙥𝙧𝙤𝙛𝙞𝙡𝙚 𝙥𝙞𝙘",
  sticker: "🎭 𝘾𝙤𝙣𝙫𝙚𝙧𝙩 𝙞𝙢𝙖𝙜𝙚 𝙩𝙤 𝙨𝙩𝙞𝙘𝙠𝙚𝙧",
  take: "✍️ 𝘾𝙪𝙨𝙩𝙤𝙢 𝙨𝙩𝙞𝙘𝙠𝙚𝙧",
  stickergif: "🎬 𝙑𝙞𝙙𝙚𝙤 → 𝙖𝙣𝙞𝙢𝙖𝙩𝙚𝙙 𝙨𝙩𝙞𝙘𝙠𝙚𝙧",
  memesticker: "😂 𝙏𝙚𝙭𝙩 → 𝙢𝙚𝙢𝙚 𝙨𝙩𝙞𝙘𝙠𝙚𝙧",
  captionsticker: "✍️ 𝘾𝙖𝙥𝙩𝙞𝙤𝙣 → 𝙨𝙩𝙞𝙘𝙠𝙚𝙧",
  stickerpack: "📦 𝘾𝙧𝙚𝙖𝙩𝙚 𝙨𝙩𝙞𝙘𝙠𝙚𝙧 𝙥𝙖𝙘𝙠",
  statussave: "📥 𝘼𝙪𝙩𝙤 𝙎𝙩𝙖𝙩𝙪𝙨 𝙎𝙖𝙫𝙚𝙧 (𝙄𝙢𝙖𝙜𝙚 / 𝙑𝙞𝙙𝙚𝙤 / 𝘼𝙪𝙙𝙞𝙤)",
statuslist: "📚 𝙑𝙞𝙚𝙬 𝙎𝙖𝙫𝙚𝙙 𝙎𝙩𝙖𝙩𝙪𝙨𝙚𝙨",
statusfilter: "👥 𝘾𝙤𝙣𝙩𝙖𝙘𝙩-𝘽𝙖𝙨𝙚𝙙 𝙁𝙞𝙡𝙩𝙚𝙧 (𝙋𝙧𝙞𝙫𝙖𝙩𝙚 𝙎𝙩𝙖𝙩𝙪𝙨 𝙎𝙖𝙫𝙚𝙧)",
statusclear: "🧹 𝘾𝙡𝙚𝙖𝙧 𝙎𝙖𝙫𝙚𝙙 𝙎𝙩𝙖𝙩𝙪𝙨𝙚𝙨",
autostatus: "⚙️ 𝙏𝙤𝙜𝙜𝙡𝙚 𝘼𝙪𝙩𝙤 𝙎𝙩𝙖𝙩𝙪𝙨 𝙎𝙖𝙫𝙚 (𝙊𝙉/𝙊𝙁𝙁)",

  // 👑 OWNER
  addowner: "👑 𝘼𝙙𝙙 𝙗𝙤𝙩 𝙤𝙬𝙣𝙚𝙧",
  delowner: "🗑️ 𝙍𝙚𝙢𝙤𝙫𝙚 𝙗𝙤𝙩 𝙤𝙬𝙣𝙚𝙧",
  owners: "📋 𝙑𝙞𝙚𝙬 𝙤𝙬𝙣𝙚𝙧𝙨",
  restart: "🔄 𝙍𝙚𝙨𝙩𝙖𝙧𝙩 𝙗𝙤𝙩",
  shutdown: "⛔ 𝙎𝙝𝙪𝙩𝙙𝙤𝙬𝙣 𝙗𝙤𝙩",
  broadcast: "📢 𝘽𝙧𝙤𝙖𝙙𝙘𝙖𝙨𝙩 𝙩𝙤 𝙖𝙡𝙡 𝙘𝙝𝙖𝙩𝙨",
 ban: "🚷 𝘽𝙡𝙤𝙘𝙠 & 𝘽𝙖𝙣 𝘾𝙤𝙣𝙩𝙖𝙘𝙩 (𝘿𝙈)",
unban: "✅ 𝙐𝙣𝙗𝙡𝙤𝙘𝙠 & 𝙐𝙣𝙗𝙖𝙣 𝘾𝙤𝙣𝙩𝙖𝙘𝙩",
banned: "📋 𝙑𝙞𝙚𝙬 𝘽𝙖𝙣𝙣𝙚𝙙 𝙐𝙨𝙚𝙧𝙨",


  // 💬 AUTO REPLY

 autoreplyon : "💬 𝙀𝙣𝙖𝙗𝙡𝙚 𝘿𝙈 𝘼𝙪𝙩𝙤 𝙍𝙚𝙥𝙡𝙮",
 autoreplyoff:  "🔕 𝘿𝙞𝙨𝙖𝙗𝙡𝙚 𝘿𝙈 𝘼𝙪𝙩𝙤 𝙍𝙚𝙥𝙡𝙮",
addreply: "➕ 𝘼𝙙𝙙 𝙆𝙚𝙮𝙬𝙤𝙧𝙙 𝙍𝙚𝙥𝙡𝙮",
delreply: "🗑️ 𝙍𝙚𝙢𝙤𝙫𝙚 𝙆𝙚𝙮𝙬𝙤𝙧𝙙 𝙍𝙚𝙥𝙡𝙮",
 listreply: "📋 𝙑𝙞𝙚𝙬 𝘼𝙡𝙡 𝙍𝙚𝙥𝙡𝙞𝙚𝙨",

  // ⚠️ WARN
  warn: "⚠️ 𝙒𝙖𝙧𝙣 𝙖 𝙪𝙨𝙚𝙧",
  warnlist: "📋 𝙑𝙞𝙚𝙬 𝙬𝙖𝙧𝙣 𝙡𝙞𝙨𝙩",
  warninfo: "👤 𝘾𝙝𝙚𝙘𝙠 𝙬𝙖𝙧𝙣 𝙝𝙞𝙨𝙩𝙤𝙧𝙮",
  unwarn: "🧹 𝘾𝙡𝙚𝙖𝙧 𝙬𝙖𝙧𝙣",
  resetwarns: "♻️ 𝙍𝙚𝙨𝙚𝙩 𝙖𝙡𝙡 𝙬𝙖𝙧𝙣𝙨",

  // 📦 STICKER PACK
  packcreate: "📦 𝘾𝙧𝙚𝙖𝙩𝙚 𝙣𝙚𝙬 𝙥𝙖𝙘𝙠",
  packadd: "➕ 𝘼𝙙𝙙 𝙨𝙩𝙞𝙘𝙠𝙚𝙧",
  packview: "👀 𝙑𝙞𝙚𝙬 𝙥𝙖𝙘𝙠",
  packlist: "📚 𝙑𝙞𝙚𝙬 𝙥𝙖𝙘𝙠𝙨",
  packdelete: "🗑️ 𝘿𝙚𝙡𝙚𝙩𝙚 𝙥𝙖𝙘𝙠",
  packsend: "🎲 𝙍𝙖𝙣𝙙𝙤𝙢 𝙥𝙖𝙘𝙠 𝙨𝙚𝙣𝙙",

  // ℹ️ INFO
  menu: "📜 𝘿𝙞𝙨𝙥𝙡𝙖𝙮 𝙛𝙪𝙡𝙡 𝙗𝙤𝙩 𝙢𝙚𝙣𝙪",
  help: "❓ 𝙂𝙚𝙩 𝙘𝙤𝙢𝙢𝙖𝙣𝙙 𝙜𝙪𝙞𝙙𝙚",
  mode: "⚙️ 𝙎𝙬𝙞𝙩𝙘𝙝 𝙗𝙤𝙩 𝙢𝙤𝙙𝙚",
  alive: "💚 𝘾𝙝𝙚𝙘𝙠 𝙗𝙤𝙩 𝙨𝙩𝙖𝙩𝙪𝙨",
  whoami: "🆔 𝙎𝙝𝙤𝙬 𝙮𝙤𝙪𝙧 𝙄𝘿",
  stats: "📊 𝘽𝙤𝙩 𝙪𝙨𝙖𝙜𝙚 𝙨𝙩𝙖𝙩𝙨",
  ping: "🏓 𝘾𝙝𝙚𝙘𝙠 𝙨𝙥𝙚𝙚𝙙",
  runtime: "⏱️ 𝙎𝙚𝙚 𝙗𝙤𝙩 𝙪𝙥𝙩𝙞𝙢𝙚",
  test: "🧪 𝙏𝙚𝙨𝙩 𝘽𝙤𝙩 𝙍𝙚𝙨𝙥𝙤𝙣𝙨𝙚",
nettest: "🌐 𝘾𝙝𝙚𝙘𝙠 𝙄𝙣𝙩𝙚𝙧𝙣𝙚𝙩 𝘾𝙤𝙣𝙣𝙚𝙘𝙩𝙞𝙤𝙣"
}


const menuHeaders = [
  "🤖 𝐆𝐈𝐁𝐁𝐎𝐑𝐋𝐄𝐄 𝐁𝐎𝐓 𝐌𝐄𝐍𝐔",
  "⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐎𝐍𝐋𝐈𝐍𝐄 • 𝐆𝐈𝐁𝐁𝐎𝐑𝐋𝐄𝐄",
  "🚀 𝐌𝐔𝐋𝐓𝐈-𝐅𝐔𝐍𝐂𝐓𝐈𝐎𝐍 𝐏𝐀𝐍𝐄𝐋",
  "🔥 𝐏𝐎𝐖𝐄𝐑 𝐌𝐎𝐃𝐄: 𝐀𝐂𝐓𝐈𝐕𝐄",
  "🧠 𝐒𝐌𝐀𝐑𝐓 𝐁𝐎𝐓 𝐈𝐍𝐓𝐄𝐑𝐅𝐀𝐂𝐄",
  "🛡️ 𝐒𝐄𝐂𝐔𝐑𝐈𝐓𝐘 𝐒𝐘𝐒𝐓𝐄𝐌 𝐀𝐂𝐓𝐈𝐕𝐄",
  "⚙️ 𝐄𝐍𝐆𝐈𝐍𝐄 𝐋𝐎𝐀𝐃𝐄𝐃 • 𝐑𝐄𝐀𝐃𝐘",
  "🌐 𝐆𝐋𝐎𝐁𝐀𝐋 𝐍𝐄𝐓𝐖𝐎𝐑𝐊 𝐎𝐍𝐋𝐈𝐍𝐄",
  "💥 𝐔𝐋𝐓𝐑𝐀 𝐏𝐄𝐑𝐅𝐎𝐑𝐌𝐀𝐍𝐂𝐄",
  "📊 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 𝐏𝐀𝐍𝐄𝐋",
  "🔔 𝐑𝐄𝐀𝐋-𝐓𝐈𝐌𝐄 𝐌𝐎𝐍𝐈𝐓𝐎𝐑",
  "👑 𝐎𝐖𝐍𝐄𝐑 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 𝐃𝐀𝐒𝐇𝐁𝐎𝐀𝐑𝐃"
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

  // PREMIUM MENU BACGROUND
async function getPremiumMenuBackground() {
  try {
    const hour = new Date().getHours()

    let theme = "nature"

    if (hour >= 5 && hour < 12) theme = "sunrise"
    else if (hour >= 12 && hour < 17) theme = "day"
    else if (hour >= 17 && hour < 21) theme = "sunset"
    else theme = "night"

    // ✅ DIRECT IMAGE FILES (NO STREAM ERRORS)
    const images = {
      sunrise: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1080&h=1920",
      day: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1080&h=1920",
      sunset: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1080&h=1920",
      night: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1080&h=1920"
    }

    return images[theme]

  } catch (e) {
    console.log("Wallpaper Error:", e)

    return "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1080&h=1920"
  }
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
   browser: Browsers.windows("Microsoft Edge"),
   
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
  "2347044625110@s.whatsapp.net",
  "2349021540840@s.whatsapp.net"
]
  
  // merge safely
const ids = [botId, ...myNumber]

  // ensure BOT_OWNERS exists + normalize existing DB
  BOT_OWNERS = Array.isArray(BOT_OWNERS)
    ? BOT_OWNERS
        .map(normalizeJid)
        .filter(Boolean)
    : []

  // clean + normalize + dedupe
const cleaned = [...new Set(
  ids
    .map(normalizeJid)
    .filter(Boolean)
)]

let added = 0

for (const id of cleaned) {
    if (!BOT_OWNERS.includes(id)) {
      BOT_OWNERS.push(id)
      added++
    }
  }

 BOT_OWNERS = Array.isArray(BOT_OWNERS)
  ? [...new Set(
      BOT_OWNERS
        .map(normalizeJid)
        .filter(Boolean)
    )]
  : []
  

saveOwners()
  
  console.log("🤖 Logged in as:", botId)
  console.log("👑 Owners:", BOT_OWNERS)
  
          // ✅ PREVENT MULTIPLE INTERVALS
          
            setInterval(() => {
                sock.sendPresenceUpdate("unavailable")
              }, 15000)
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
    const prefix = msg.prefix || "!"
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
const botId = normalizeJid(sock.user?.id || "")
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

const body = (
  msg.message?.conversation ||
  msg.message?.extendedTextMessage?.text ||
  msg.message?.imageMessage?.caption ||
  msg.message?.videoMessage?.caption ||
  msg.message?.buttonsResponseMessage?.selectedButtonId ||
  msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
  ""
).toString()

if (jid === "status@broadcast" && global.AUTO_SAVE_STATUS) {
  try {

    const content = msg.message
    if (!content) return

    console.log("🔥 STATUS DETECTED")

    const media =
      content.imageMessage ||
      content.videoMessage ||
      content.audioMessage

    if (!media) return

    const type =
      content.imageMessage ? "image" :
      content.videoMessage ? "video" :
      content.audioMessage ? "audio" :
      null

    if (!type) return

    const stream = await downloadContentFromMessage(media, type)

    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }

    if (!buffer.length) return

    const hash = crypto.createHash("md5").update(buffer).digest("hex")

    if (global.STATUS_HASH.has(hash)) return
    global.STATUS_HASH.add(hash)

    const sender = msg.key.participant || msg.key.remoteJid || ""

    const allowed = global.ALLOWED_STATUS_CONTACTS || []
    if (allowed.length && !allowed.includes(sender)) return

    const dir = "./status"
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const file = path.join(dir, `${Date.now()}.${type}`)

    fs.writeFileSync(file, buffer)

    console.log("📥 STATUS SAVED:", file)

    global.STATUS_DB.push({
      file,
      type,
      sender,
      time: Date.now()
    })

    setTimeout(() => {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file)
        global.STATUS_DB = global.STATUS_DB.filter(s => s.file !== file)
      } catch {}
    }, 24 * 60 * 60 * 1000)

    await forwardToOwner(sock, buffer, "📥 New Status Saved")

  } catch (e) {
    console.log("🔥 Status error:", e)
  }
}

 // ================= DM AUTO REPLY =================
if (
  isDM &&
  !isOwner &&
  !isBot &&
  global.DM_AUTO_REPLY.enabled
) {
  try {
    // ❌ Ignore commands
    if (!body.startsWith(PREFIX)) {

      global.LAST_DM_REPLY =
        global.LAST_DM_REPLY || {}

      const now = Date.now()
      const cooldown = 15000 // 15s anti-spam

      if (
        !global.LAST_DM_REPLY[sender] ||
        now - global.LAST_DM_REPLY[sender] > cooldown
      ) {
        const autoReply =
          getSmartAutoReply(body)

        await sock.sendMessage(
          jid,
          { text: autoReply },
          { quoted: msg }
        )

        global.LAST_DM_REPLY[sender] = now
      }
    }

  } catch (e) {
    console.log(
      "Smart DM Auto Reply Error:",
      e
    )
  }
}

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
      if (!isOwner) {

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
      if (!isOwner) {

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
  delete: "🧼",
  remove: "🚮",

  setname: "✏️",
  setdesc: "📝",
  groupinfo: "📊",
  grouplink: "🔗",
  revoke: "♻️",
  lock: "🔒",
  unlock: "🔓",

  requests:"📨",

  getstatus: "📥",
  vv: "👁️",
  pp: "🖼️",
  sticker: "🎭",
  take: "✍️",
  stickergif: "🎬",
  memesticker: "😂",
  captionsticker: "✍️",
  stickerpack: "📦",
    statuslist: "📚",
  autostatus: "⚙️",
  statusfilter: "👥",
  statusclear: "🧹",

  addowner: "👑",
  delowner: "🗑️",
  owners: "📋",
  restart: "🔄",
  shutdown: "⛔",
  broadcast: "📢",
  ban: "🚷",
  unban: "✅",
  banned: "📋",

  autoreplyon: "💬",
  autoreplyoff: "🔕",
  addreply: "➕",
  delreply: "🗑️",

  default: "⚡",

  warn: "⚠️",
  warnlist: "📋",
  warninfo: "👤",
  unwarn: "🧹",

  help:"❓",
  runtime:"🕒",
  mode: "⚙️",
  alive: "💚",
  whoami: "🆔",
  stats: "📊",
  ping: "🏓",
  menu: "📃",
  settings: "🛠️",
  test: "🧪",
  nettest: "🌐",

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

take: async () => {
  const packname = args[0]
  const author = args.slice(1).join(" ")

  if (!packname || !author) {
    await react(sock, jid, msg.key, "❓")
    return reply(`❌ Example: ${prefix}take Packname Author`)
  }

  const quoted =
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

  if (!quoted || !quoted.stickerMessage) {
    await react(sock, jid, msg.key, "🖼️")
    return reply("❌ Reply to a sticker")
  }

  await react(sock, jid, msg.key, "⏳")

  try {
    const media = await downloadMediaMessage(
      {
        key: msg.message.extendedTextMessage.contextInfo.stanzaId
          ? {
              remoteJid: jid,
              id: msg.message.extendedTextMessage.contextInfo.stanzaId,
              participant:
                msg.message.extendedTextMessage.contextInfo.participant
            }
          : msg.key,
        message: quoted
      },
      "buffer",
      {},
      {
        logger,
        reuploadRequest: sock.updateMediaMessage
      }
    )

    await sock.sendImageAsSticker(
      jid,
      media,
      msg,
      {
        packname,
        author
      }
    )

    await react(sock, jid, msg.key, "✨")

  } catch (err) {
    console.log("Take error:", err.message)

    await react(sock, jid, msg.key, "❌")

    reply("❌ Failed to create custom sticker")
  }
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
        if (!isOwner) return reply("❌ Bot owner only")
        group_settings.antidelete = args[0] === "on"
        saveGroupSettings()
        reply(`🧠 Anti-delete ${group_settings.antidelete ? "ON" : "OFF"}`)
      },

      antilink: async () => {
        if (!isOwner) return reply("❌ Bot owner only")
        group_settings.antilink = args[0] === "on"
        saveGroupSettings()
        reply(`🔗 Anti-link ${group_settings.antilink ? "ON" : "OFF"}`)
      },

      antibadword: async () => {
  if (!isOwner) return reply("❌ Admin only  or Bot owner only")

  group_settings.antibadword = args[0] === "on"
  saveGroupSettings()

  reply(`🧼 Anti-badword ${group_settings.antibadword ? "ON" : "OFF"}`)
},

  settings: async () => {
  if (!isOwner) {
    await react(sock, jid, msg.key, "error")
    return reply("❌ Owner only")
  }

  await react(sock, jid, msg.key, "loading")

  reply(
`⚙️ *SETTINGS PANEL*

🛡️ *Protection*
🧠 Anti-Delete: ${group_settings.antidelete ? "✅ ON" : "❌ OFF"}
🔗 Anti-Link: ${group_settings.antilink ? "✅ ON" : "❌ OFF"}
🧼 Anti-Badword: ${group_settings.antibadword ? "✅ ON" : "❌ OFF"}

👁️ *Status Protection*
🚫 Anti-Status: ${group_settings.antistatus ? "✅ ON" : "❌ OFF"}
📢 Anti-Status Mention: ${group_settings.antistatus_mention ? "✅ ON" : "❌ OFF"}

📥 *Status System*
💾 Auto Save Status: ${global.AUTO_SAVE_STATUS ? "✅ ON" : "❌ OFF"}
👥 Allowed Contacts: ${global.ALLOWED_STATUS_CONTACTS?.length || 0}
📚 Saved Status: ${global.STATUS_DB?.length || 0}

💬 *DM Auto Reply*
💬 Auto Reply: ${global.DM_AUTO_REPLY?.enabled ? "✅ ON" : "❌ OFF"}

🚷 *Ban System*
🚷 Banned Users: ${global.BANNED_USERS ? Object.keys(global.BANNED_USERS).length : 0}
🔒 Block Sync: ${global.BLOCK_SYNC ? "✅ ON" : "❌ OFF"}

🔐 *Bot Mode*
⚙️ Mode: ${String(settings.mode || "public").toUpperCase()}

👑 *Owner Controls*
👑 Owners: ${BOT_OWNERS.length}

📊 *System*
👥 Group: ${isGroup ? "✅ Group Chat" : "❌ Private Chat"}
👑 Your Role: ${isOwner ? "Bot Owner" : isAdmin ? "Group Admin" : "Member"}

⚡ *Runtime*
⏱️ Uptime: ${formatRuntime(process.uptime())}
📨 Messages: ${BOT_STATS.messages}

🗂️ *Database*
📚 Status DB: ${global.STATUS_DB?.length || 0}
🚷 Ban DB: ${global.BANNED_USERS ? Object.keys(global.BANNED_USERS).length : 0}
👥 Owners DB: ${BOT_OWNERS.length}`
  )

  await react(sock, jid, msg.key, "success")
},
     
      // ======== WARNING ==========

  // ================= WARN USER =================
    warn: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner) return reply("❌ Bot owner only")

  const target = getTarget()
  if (!target) return reply("❌ Mention user")

  const reason = args.slice(1).join(" ") || "No reason provided"

  if (!WARN_DB[jid]) WARN_DB[jid] = {}
  if (!WARN_DB[jid][target]) WARN_DB[jid][target] = []

  WARN_DB[jid][target].push({
    reason,
    by: sender,
    time: Date.now()
  })

  saveWarnDB()

  const count = WARN_DB[jid][target].length

  await reply(
`⚠️ *WARNING ISSUED*

👤 User: @${target.split("@")[0]}
⚠️ Warn: ${count}/3
📝 Reason: ${reason}`
  )

  // AUTO KICK SYSTEM
  if (count >= 3) {
    await sock.groupParticipantsUpdate(jid, [target], "remove")

    delete WARN_DB[jid][target]
    saveWarnDB()

    return reply("🚫 User removed after 3 warnings")
  }
},


warnlist: async () => {
  if (!isGroup) return reply("❌ Group only")
if (!isOwner) return reply("❌ Bot owner only")

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
if (!isOwner) return reply("❌ Bot owner only")

  const target = getTarget()
  if (!target) return reply("❌ Mention user")

  if (!WARN_DB[jid] || !WARN_DB[jid][target])
    return reply("❌ No warnings found")

  delete WARN_DB[jid][target]
  saveWarnDB()

  reply(`✅ Warnings cleared for @${target.split("@")[0]}`)
},

warninfo: async () => {
  if (!isGroup) return reply("❌ Group only")
if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

  await react("♻️")

  WARN_DB[jid] = {}
  saveWarnDB()

  reply("♻️ All group warnings cleared")
},


      viewadmins: async () => {
  if (!isGroup) return reply("❌ Group only")
    if (!isOwner) return reply("❌ Bot owner only")

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
 // 👑 ADD OWNER BY NUMBER (no @mentions)
addowner: async () => {
  if (!isOwner) return reply("❌ Owner only")

  let number = args[0]?.replace(/\D/g, "")
  if (!number) {
    return reply("❌ Usage: !addowner 2348012345678")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const clean = number + "@s.whatsapp.net"

  if (!BOT_OWNERS.includes(clean)) {
    BOT_OWNERS.push(clean)
    saveOwners()
    reply(`👑 Owner added successfully: ${number}`)
  } else {
    reply(`⚠️ ${number} is already an owner`)
  }
},

// ❌ REMOVE OWNER BY NUMBER (no @mentions)
delowner: async () => {
  if (!isOwner) return reply("❌ Owner only")

  let number = args[0]?.replace(/\D/g, "")
  if (!number) {
    return reply("❌ Usage: !delowner 2348012345678")
  }

  // Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const clean = number + "@s.whatsapp.net"

  if (!BOT_OWNERS.includes(clean)) {
    return reply(`⚠️ ${number} is not in owner list`)
  }

  BOT_OWNERS = BOT_OWNERS.filter(
    (x) => normalizeJid(x) !== clean
  )

  saveOwners()
  reply(`👑 Owner removed successfully: ${number}`)
},

// 📋 LIST OWNERS BY NUMBER ONLY
owners: async () => {
   if (!isOwner) return reply("❌ Owner only")
 reply(
    "👑 Owners:\n" +
    BOT_OWNERS.map((o, i) => `${i + 1}. ${o.split("@")[0]}`).join("\n")
  )
   if (!BOT_OWNERS.length) {
    return reply("❌ No owners found")
   }
},

// ====== AUTO REPLY=======

autoreplyon: async () => {
  if (!isOwner) return reply("❌ Owner only")

  global.DM_AUTO_REPLY.enabled = true
  reply("💬 Auto Reply Enabled ✅")
},

autoreplyoff: async () => {
  if (!isOwner) return reply("❌ Owner only")

  global.DM_AUTO_REPLY.enabled = false
  reply("🔕 Auto Reply Disabled ❌")
},


addreply: async () => {
  if (!isOwner) return reply("❌ Owner only")

  const [keyword, ...msgParts] = args
  const message = msgParts.join(" ")

  if (!keyword || !message) {
    return reply("❌ Usage: .addreply hello Hi there 👋")
  }

  if (!global.DM_AUTO_REPLY.words[keyword]) {
    global.DM_AUTO_REPLY.words[keyword] = []
  }

  global.DM_AUTO_REPLY.words[keyword].push(message)

  return reply(`✅ Added reply for "${keyword}"`)
},

delreply: async () => {
  if (!isOwner) return reply("❌ Owner only")

  const keyword = args[0]

  if (!keyword) return reply("❌ Usage: .delreply hello")

  delete global.DM_AUTO_REPLY.words[keyword]

  return reply(`🗑️ Deleted replies for "${keyword}"`)
},

listreply: async () => {
  if (!isOwner) return reply("❌ Owner only")

  let text = "💬 *AUTO REPLY LIST*\n\n"

  for (const key in global.DM_AUTO_REPLY.words) {
    text += `🔹 ${key}:\n`

    global.DM_AUTO_REPLY.words[key].forEach((r, i) => {
      text += `   ${i + 1}. ${r}\n`
    })

    text += "\n"
  }

  reply(text)
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
  if (!isOwner) {
    await react(sock, jid, msg.key, "error")
    return reply("❌ Owner only")
  }

  await react(sock, jid, msg.key, "loading")

  let number =
    args[0]?.replace(/\D/g, "") ||
    msg.message?.extendedTextMessage?.contextInfo?.participant?.split("@")[0]

  if (!number) {
    await react(sock, jid, msg.key, "error")
    return reply("❌ Usage: !ban 2348012345678 or reply to a user")
  }

  // 🇳🇬 Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = number + "@s.whatsapp.net"

  if (!global.BANNED_USERS) global.BANNED_USERS = {}

  if (global.BANNED_USERS[target]) {
    await react(sock, jid, msg.key, "warn")
    return reply(`⚠️ ${number} is already banned`)
  }

  global.BANNED_USERS[target] = {
    bannedBy: sender,
    time: Date.now()
  }

  // 🚫 Block in DM
  try {
    await sock.updateBlockStatus(target, "block")
  } catch (e) {
    console.log("Block sync error:", e)
  }

  await react(sock, jid, msg.key, "ban")

  reply(`🚷 Blocked & banned ${number} from using the bot`)
},

unban: async () => {
  if (!isOwner) {
    await react(sock, jid, msg.key, "error")
    return reply("❌ Owner only")
  }

  await react(sock, jid, msg.key, "loading")

  let number =
    args[0]?.replace(/\D/g, "") ||
    msg.message?.extendedTextMessage?.contextInfo?.participant?.split("@")[0]

  if (!number) {
    await react(sock, jid, msg.key, "error")
    return reply("❌ Usage: .unban 2348012345678 or reply to a user")
  }

  // 🇳🇬 Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = number + "@s.whatsapp.net"

  if (!global.BANNED_USERS || !global.BANNED_USERS[target]) {
    await react(sock, jid, msg.key, "warn")
    return reply(`⚠️ ${number} is not banned`)
  }

  delete global.BANNED_USERS[target]

  // ✅ Unblock in DM
  try {
    await sock.updateBlockStatus(target, "unblock")
  } catch (e) {
    console.log("Unblock sync error:", e)
  }

  await react(sock, jid, msg.key, "success")

  reply(`✅ Unblocked & unbanned ${number}`)
},

banned: async () => {
  if (!isOwner) {
    await react(sock, jid, msg.key, "error")
    return reply("❌ Owner only")
  }

  await react(sock, jid, msg.key, "loading")

  const banned = global.BANNED_USERS || {}
  const users = Object.keys(banned)

  if (!users.length) {
    await react(sock, jid, msg.key, "info")
    return reply("📭 No banned users")
  }

  let text = "🚷 *BANNED USERS LIST*\n\n"

  users.forEach((user, i) => {
    text += `${i + 1}. @${user.split("@")[0]}\n`
  })

  await react(sock, jid, msg.key, "success")

  return sock.sendMessage(jid, {
    text,
    mentions: users
  })
},

// ================= MUTE USER =================
mute: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner) return reply("❌ Bot owner only")

  await react("🔇")

  const target = normalizeJid(getTarget())
  if (!target) return reply("❌ Mention user")

  if (!MUTED_USERS[jid]) MUTED_USERS[jid] = []

  let MUTED_USERS = MUTED_USERS || {}

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
  if (!isOwner) return reply("❌ Bot owner only")

  await react("🔊")

  const target = normalizeJid(getTarget())
  if (!target) return reply("❌ Mention user")

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
  if (!isOwner) return reply("❌ Bot owner only")

  await react("🧹")

  group_settings.antilink = true
  saveGroupSettings()

  reply("🧹 Anti-link reinforced. New links will be auto-deleted.")
},



      // ===== TAG =====
     tageveryone: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

  try {
    await sock.groupSettingUpdate(jid, "announcement")
    reply("🔒 Group locked (admins only)")
  } catch {
    reply("❌ Failed to lock group")
  }
},

unlock: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

  await react("🗑️")

  delete GROUP_SCHEDULES[jid]
  saveGroupSchedules()

  reply("🗑️ Group schedule deleted")
},


// ==== GROUP MANAGEMENT =====
setname: async () => {
    if (!isGroup) return reply("❌ Group only")
    if (!isOwner) return reply("❌ Bot owner only")

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
    if (!isOwner) return reply("❌ Bot owner only")

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
    if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")

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
  if (!isOwner) return reply("❌ Bot owner only")
  await sock.groupRevokeInvite(jid)
  reply("🔄 Group link reset successful")
},

// ================= ADD USER =================
add: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner) {
    return reply("❌ Bot owner only")
  }

  let number = args[0]?.replace(/\D/g, "") // removes +, spaces, etc.

  if (!number) {
    return reply("❌ Usage: !add 2348012345678")
  }

  // 🇳🇬 Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const user = number + "@s.whatsapp.net"

  try {
    // 👥 Add user directly
    const result = await sock.groupParticipantsUpdate(
      jid,
      [user],
      "add"
    )

    // 📊 Optional group name
    const meta = await sock.groupMetadata(jid)
    const groupName = meta.subject || "WhatsApp Group"

    // ✅ Success message
    await sock.sendMessage(
      jid,
      {
        text:
`➕ *USER ADDED*

👤 User: @${number}
🏷️ Group: ${groupName}
👑 Added By: @${sender.split("@")[0]}
✅ Status: Successful`,
        mentions: [user, sender]
      },
      { quoted: msg }
    )

  } catch (e) {

    console.log("Add error:", e)

    // ❌ Fallback if privacy blocks direct add
    try {
      const code = await sock.groupInviteCode(jid)
      const link = `https://chat.whatsapp.com/${code}`

      await sock.sendMessage(
        user,
        {
          text:
`👋 *GROUP INVITATION*

🏷️ You couldn't be added directly due to privacy settings.

🔗 Join Here:
${link}

👑 Invited By: @${sender.split("@")[0]}`,
          mentions: [sender]
        }
      )

      await sock.sendMessage(
        jid,
        {
          text:
`⚠️ *DIRECT ADD FAILED — INVITE SENT*

👤 User: @${number}
👑 By: @${sender.split("@")[0]}
📩 Private invite link sent instead`,
          mentions: [user, sender]
        },
        { quoted: msg }
      )

    } catch {

      await sock.sendMessage(
        jid,
        {
          text:
`❌ *ADD FAILED*

👤 User: @${number}
👑 By: @${sender.split("@")[0]}
⚠️ Could not add or invite user`,
          mentions: [user, sender]
        },
        { quoted: msg }
      )
    }
  }
},

invite: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner) {
    return reply("❌ Bot owner only")
  }

  let number = args[0]?.replace(/\D/g, "") // remove spaces, +, symbols

  if (!number) {
    return reply("❌ Usage: !invite 2348012345678")
  }

  // 🇳🇬 Auto-fix Nigerian local format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const target = number + "@s.whatsapp.net"

  try {
    // 🔗 Get fresh group invite code
    const code = await sock.groupInviteCode(jid)
    const link = `https://chat.whatsapp.com/${code}`

    // 👥 Group metadata
    const meta = await sock.groupMetadata(jid)
    const groupName = meta.subject || "WhatsApp Group"

    // 📩 Send invite privately
    await sock.sendMessage(
      target,
      {
        text:
`👋 *GROUP INVITATION*

🏷️ Group: ${groupName}
👑 Invited By: @${sender.split("@")[0]}

🔗 Join Link:
${link}

⚡ Powered by Bot`,
        mentions: [sender]
      }
    )

    // ✅ Confirm publicly
    await sock.sendMessage(
      jid,
      {
        text:
`🔗 *INVITE SENT*

📩 User: @${number}
🏷️ Group: ${groupName}
👑 By: @${sender.split("@")[0]}
✅ Status: Successful`,
        mentions: [target, sender]
      },
      { quoted: msg }
    )

  } catch (e) {

    console.log("Invite error:", e)

    await sock.sendMessage(
      jid,
      {
        text:
`❌ *INVITE FAILED*

📩 User: @${number}
👑 By: @${sender.split("@")[0]}
⚠️ Could not send invite link`,
        mentions: [target, sender]
      },
      { quoted: msg }
    )
  }
},

// ================= KICK USER =================
 kick: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner && !isAdmin) return reply("❌ Owner/Admin only")

  let number = args[0]?.replace(/\D/g, "") // remove spaces, +, symbols

  if (!number) {
    return reply("❌ Usage: !kick 2348012345678")
  }

  // 🇳🇬 Auto-fix local Nigerian format
  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const user = number + "@s.whatsapp.net"

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [user],
      "remove"
    )

    await sock.sendMessage(
      jid,
      {
        text:
`👢 *USER REMOVED*

🚫 User: @${number}
👑 By: @${sender.split("@")[0]}
📛 Action: Kick Successful`,
        mentions: [user, sender]
      },
      { quoted: msg }
    )

  } catch (e) {

    console.log("Remove error:", e)

    await sock.sendMessage(
      jid,
      {
        text:
`❌ *KICK FAILED*

🚫 User: @${number}
⚠️ Reason: Could not remove user
👑 By: @${sender.split("@")[0]}`,
        mentions: [user, sender]
      },
      { quoted: msg }
    )
  }
},


// ================= PROMOTE USER =================

     promote: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner) {
    return reply("❌ Bot owner only")
  }

  const target = getTarget()

  if (!target) {
    return reply("❌ Reply to or mention a user")
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "promote"
    )

    await sock.sendMessage(
      jid,
      {
        text:
`⬆️ *USER PROMOTED*

👤 User: @${target.split("@")[0]}
👮 New Role: Group Admin
👑 Promoted By: @${sender.split("@")[0]}
✅ Status: Successful`,
        mentions: [target, sender]
      },
      { quoted: msg }
    )

  } catch (e) {

    console.log("Promote error:", e)

    await sock.sendMessage(
      jid,
      {
        text:
`❌ *PROMOTION FAILED*

👤 User: @${target.split("@")[0]}
👑 Attempted By: @${sender.split("@")[0]}
⚠️ Could not promote user`,
        mentions: [target, sender]
      },
      { quoted: msg }
    )
  }
},

demote: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner) {
    return reply("❌ Bot owner only")
  }

  const target = getTarget()

  if (!target) {
    return reply("❌ Reply to or mention a user")
  }

  try {
    await sock.groupParticipantsUpdate(
      jid,
      [target],
      "demote"
    )

    await sock.sendMessage(
      jid,
      {
        text:
`⬇️ *USER DEMOTED*

👤 User: @${target.split("@")[0]}
👮 Role Removed: Admin
👑 Demoted By: @${sender.split("@")[0]}
✅ Status: Successful`,
        mentions: [target, sender]
      },
      { quoted: msg }
    )

  } catch (e) {

    console.log("Demote error:", e)

    await sock.sendMessage(
      jid,
      {
        text:
`❌ *DEMOTION FAILED*

👤 User: @${target.split("@")[0]}
👑 Attempted By: @${sender.split("@")[0]}
⚠️ Could not demote user`,
        mentions: [target, sender]
      },
      { quoted: msg }
    )
  }
},



// promote: async () => {
//   if (!isGroup) return reply("❌ Group only")
//   if (!isOwner) return reply("❌ Bot owner only")

//   // supports mention, reply, or raw number
//   let number =
//     getTarget()?.split("@")[0] ||
//     args[0]?.replace(/\D/g, "")

//   if (!number) {
//     return reply("❌ Usage: .promote @user | reply | 2348012345678")
//   }

//   // Auto-fix Nigerian local format
//   if (number.startsWith("0")) {
//     number = "234" + number.slice(1)
//   }

//   const target = normalizeJid(number + "@s.whatsapp.net")

//   if (!target) return reply("❌ Invalid user")

//   try {
//     await sock.groupParticipantsUpdate(jid, [target], "promote")

//     reply(`👮 @${number} is now an admin`, {
//       mentions: [target]
//     })
//   } catch (e) {
//     console.log("Promote error:", e)

//     reply(`❌ Failed to promote @${number}`, {
//       mentions: [target]
//     })
//   }
// },

// // ================= DEMOTE USER =================
// demote: async () => {
//   if (!isGroup) return reply("❌ Group only")
//   if (!isOwner) return reply("❌ Bot owner only")

//   // supports mention, reply, or raw number
//   let number =
//     getTarget()?.split("@")[0] ||
//     args[0]?.replace(/\D/g, "")

//   if (!number) {
//     return reply("❌ Usage: .demote @user | reply | 2348012345678")
//   }

//   // Auto-fix Nigerian local format
//   if (number.startsWith("0")) {
//     number = "234" + number.slice(1)
//   }

//   const target = normalizeJid(number + "@s.whatsapp.net")

//   if (!target) return reply("❌ Invalid user")

//   try {
//     await sock.groupParticipantsUpdate(jid, [target], "demote")

//     reply(`⬇️ @${number} removed as admin`, {
//       mentions: [target]
//     })
//   } catch (e) {
//     console.log("Demote error:", e)

//     reply(`❌ Failed to demote @${number}`, {
//       mentions: [target]
//     })
//   }
// },

approve: async () => {
  if (!isGroup) {
    await react(sock, jid, msg.key, "❌")
    return reply("❌ Group only")
  }

  if (!isOwner) {
    await react(sock, jid, msg.key, "🚫")
    return reply("❌ Bot owner only")
  }

  let target =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
    msg.message?.extendedTextMessage?.contextInfo?.participant ||
    args[0]

  if (!target) {
    await react(sock, jid, msg.key, "❓")
    return reply("❌ Mention, reply, or type a number")
  }

  target = String(target).replace(/\D/g, "")

  if (target.startsWith("0")) {
    target = "234" + target.slice(1)
  }

  if (target.length < 10) {
    await react(sock, jid, msg.key, "⚠️")
    return reply("❌ Invalid number")
  }

  target = normalizeJid(
    target.includes("@s.whatsapp.net")
      ? target
      : `${target}@s.whatsapp.net`
  )

  try {
    await sock.groupRequestParticipantsUpdate(jid, [target], "approve")

    // ✅ Success reaction options:
    // ✅ = approved
    // 🎉 = welcome
    // 👍 = accepted
    await react(sock, jid, msg.key, "✅")

    reply(`✅ Approved: ${target.split("@")[0]}`)

  } catch (err) {
    console.log("Approve error:", err.message)

    // ❌ Failure reaction options:
    // ❌ = failed
    // ⚠️ = issue
    // 🚫 = denied
    await react(sock, jid, msg.key, "❌")

    reply("❌ Failed (ensure join approval is ON or request exists)")
  }
},

approveall: async () => {
  if (!isGroup) {
    await react(sock, jid, msg.key, "❌")
    return reply("❌ Group only")
  }

  if (!isOwner) {
    await react(sock, jid, msg.key, "🚫")
    return reply("❌ Bot owner only")
  }

  try {
    const requests = await sock.groupRequestParticipantsList(jid)

    if (!requests || requests.length === 0) {
      await react(sock, jid, msg.key, "📭")
      return reply("❌ No pending join requests")
    }

    const users = requests
      .map(u => normalizeJid(u.jid))
      .filter(Boolean)

    if (!users.length) {
      await react(sock, jid, msg.key, "⚠️")
      return reply("❌ No valid pending requests found")
    }

    await sock.groupRequestParticipantsUpdate(jid, users, "approve")

    // ✅ Success reaction options:
    // ✅ = approved
    // 🎉 = batch success
    // 🚀 = mass approval
    await react(sock, jid, msg.key, "🎉")

    reply(`✅ Approved ${users.length} join request(s)`)

  } catch (e) {
    console.log("ApproveAll error:", e.message)

    // ❌ Failure reaction options:
    // ❌ = failed
    // ⚠️ = issue
    // 🚫 = denied
    await react(sock, jid, msg.key, "❌")

    reply("❌ Failed to approve requests (maybe join approval is OFF)")
  }
},


reject: async () => {
  if (!isGroup) {
    await react(sock, jid, msg.key, "❌")
    return reply("❌ Group only")
  }

  if (!isOwner) {
    await react(sock, jid, msg.key, "🚫")
    return reply("❌ Bot owner only")
  }

  // ================= TARGET RESOLVER =================
  let target =
    // Mentioned user
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||

    // Quoted user
    msg.message?.extendedTextMessage?.contextInfo?.participant ||

    // Raw number from command
    args[0]

  if (!target) {
    await react(sock, jid, msg.key, "❓")
    return reply("❌ Mention, reply, or type a number")
  }

  // ================= NORMALIZE NUMBER =================
  target = String(target).replace(/\D/g, "")

  // Auto-convert local Nigerian format
  if (target.startsWith("0")) {
    target = "234" + target.slice(1)
  }

  // Validate basic number length
  if (target.length < 10) {
    await react(sock, jid, msg.key, "⚠️")
    return reply("❌ Invalid number")
  }

  // Convert to WhatsApp JID
  target = normalizeJid(
    target.includes("@s.whatsapp.net")
      ? target
      : `${target}@s.whatsapp.net`
  )

  try {
    await sock.groupRequestParticipantsUpdate(jid, [target], "reject")

    // ❌ Success reject reaction options:
    // ❌ = rejected
    // 🚫 = denied
    // ⛔ = blocked request
    await react(sock, jid, msg.key, "🚫")

    reply(`❌ Rejected: ${target.split("@")[0]}`)

  } catch (err) {
    console.log("Reject error:", err.message)

    // ⚠️ Failure reaction options:
    // ⚠️ = issue
    // ❌ = failed
    await react(sock, jid, msg.key, "⚠️")

    reply("❌ Failed (ensure join approval is ON or request exists)")
  }
},

rejectall: async () => {
  if (!isGroup) {
    await react(sock, jid, msg.key, "❌")
    return reply("❌ Group only")
  }

  if (!isOwner) {
    await react(sock, jid, msg.key, "🚫")
    return reply("❌ Bot owner only")
  }

  try {
    const requests = await sock.groupRequestParticipantsList(jid)

    if (!requests || requests.length === 0) {
      await react(sock, jid, msg.key, "📭")
      return reply("❌ No pending join requests")
    }

    const users = requests
      .map(u => normalizeJid(u.jid))
      .filter(Boolean)

    if (!users.length) {
      await react(sock, jid, msg.key, "⚠️")
      return reply("❌ No valid pending requests found")
    }

    await sock.groupRequestParticipantsUpdate(jid, users, "reject")

    // 🚫 Success reject-all reaction options:
    // 🚫 = mass rejected
    // ❌ = all denied
    // ⛔ = blocked batch
    await react(sock, jid, msg.key, "🚫")

    reply(`❌ Rejected ${users.length} join request(s)`)

  } catch (e) {
    console.log("RejectAll error:", e.message)

    // ⚠️ Failure reaction options:
    // ⚠️ = issue
    // ❌ = failed
    await react(sock, jid, msg.key, "⚠️")

    reply("❌ Failed to reject requests (maybe join approval is OFF)")
  }
},

requests: async () => {
  if (!isGroup) {
    await react(sock, jid, msg.key, "❌")
    return reply("❌ Group only")
  }

  if (!isOwner) {
    await react(sock, jid, msg.key, "🚫")
    return reply("❌ Bot owner only")
  }

  await react(sock, jid, msg.key, "⏳")

  try {
    const requests = await sock.groupRequestParticipantsList(jid)

    if (!requests || requests.length === 0) {
      await react(sock, jid, msg.key, "📭")
      return reply("❌ No pending join requests")
    }

    let text = `📨 *PENDING JOIN REQUESTS* (${requests.length})\n\n`

    requests.forEach((user, i) => {
      const number = user.jid.split("@")[0]

      text += `*${i + 1}.* wa.me/${number}\n`

      if (user.request_method) {
        text += `   🌐 Method: ${user.request_method}\n`
      }

      if (user.request_time) {
        const time = new Date(user.request_time * 1000).toLocaleString()
        text += `   🕒 Time: ${time}\n`
      }

      text += "\n"
    })

    text += `✅ Use ${prefix}approve <number>\n`
    text += `🚫 Use ${prefix}reject <number>\n`
    text += `🎉 Use ${prefix}approveall\n`
    text += `⛔ Use ${prefix}rejectall`

    await react(sock, jid, msg.key, "📨")

    reply(text)

  } catch (err) {
    console.log("Requests error:", err.message)

    await react(sock, jid, msg.key, "⚠️")

    reply("❌ Failed to fetch join requests (ensure join approval is ON)")
  }
},

// ================= ANTI STATUS =================
antistatus: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner) return reply("❌ Bot owner only")

  group_settings.antistatus = args[0] === "on"
  saveGroupSettings()

  reply(`🚫 Anti-status ${group_settings.antistatus ? "ON" : "OFF"}`)
},

antistatusmention: async () => {
  if (!isGroup) return reply("❌ Group only")
  if (!isOwner) return reply("❌ Bot owner only")

  group_settings.antistatus_mention = args[0] === "on"
  saveGroupSettings()

  reply(`📢 Anti-status mention ${group_settings.antistatus_mention ? "ON" : "OFF"}`)
},

delete: async () => {
  if (!isOwner) return reply("❌ Bot owner only")

  const quoted = msg.message?.extendedTextMessage?.contextInfo
  if (!quoted) return reply("❌ Reply to a message to delete")

  const key = {
    remoteJid: jid,
    fromMe: quoted.fromMe || false,
    id: quoted.stanzaId || quoted.key?.id,
  }

  // only add participant if it exists (group chats)
  if (quoted.participant) {
    key.participant = quoted.participant
  }

  try {
    await sock.sendMessage(jid, { delete: key })
    reply("🗑️ Message deleted")
  } catch (e) {
    console.log(e)
    reply("❌ Failed to delete message")
  }
},

remove: async () => {
  if (!isOwner) return reply("❌ Bot owner only")

  const quoted = msg.message?.extendedTextMessage?.contextInfo
  if (!quoted) return reply("❌ Reply to message")

  const key = {
    remoteJid: jid,
    fromMe: quoted.fromMe || false,
    id: quoted.stanzaId || quoted.key?.id,
  }

  if (quoted.participant) {
    key.participant = quoted.participant
  }

  try {
    await sock.sendMessage(jid, { delete: key })
    reply("🗑️ Message removed")
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

test: async () => {
  if (!isOwner) return reply("❌ Owner only")
  try {
    const res = await fetch("https://example.com")
    const text = await res.text()

    return reply("✅ Fetch working. Length: " + text.length)
  } catch (e) {
    return reply("❌ Fetch blocked: " + e.message)
  }
},

nettest: async () => {
  if (!isOwner) return reply("❌ Owner only")
  try {
    const res = await fetch("https://www.google.com")
    const text = await res.text()

    reply("✅ Internet OK")
  } catch (e) {
    reply("❌ No internet access from bot server")
  }
},

help: async () => {
  if (!isOwner) return reply("❌ Owner only")
  await react(sock, jid, msg.key, "📖")

  const text = `
📖 𝘾𝙊𝙈𝙈𝘼𝙉𝘿 𝙂𝙐𝙄𝘿𝙀

👤 𝙃𝙤𝙬 𝙩𝙤 𝙪𝙨𝙚 𝙗𝙤𝙩:
➤ Type commands with prefix: ${prefix}
➤ Example: ${prefix}menu

📌 𝙀𝙭𝙖𝙢𝙥𝙡𝙚𝙨:
➤ ${prefix}tagall
➤ ${prefix}kick @user
➤ ${prefix}approve
➤ ${prefix}rejectall

⚙️ 𝙏𝙞𝙥𝙨:
➤ Reply to messages for actions
➤ Mention users where needed
➤ Use numbers for some commands

🤖 𝘽𝙤𝙩 𝙨𝙪𝙥𝙥𝙤𝙧𝙩𝙨:
➤ Groups
➤ DMs
➤ Admin controls
➤ Auto systems

💡 𝙐𝙨𝙚 ${prefix}menu 𝙩𝙤 𝙨𝙚𝙚 𝙖𝙡𝙡 𝙘𝙤𝙢𝙢𝙖𝙣𝙙𝙨
`

  reply(text)
},

runtime: async () => {
  await react(sock, jid, msg.key, "⏱️")

  try {
    const uptime = process.uptime() // in seconds

    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    const seconds = Math.floor(uptime % 60)

    const text = `
⏱️ 𝘽𝙊𝙏 𝙍𝙐𝙉𝙏𝙄𝙈𝙀

📆 Days: ${days}
⏰ Hours: ${hours}
⏳ Minutes: ${minutes}
⏱️ Seconds: ${seconds}

⚡ Status: Online
`

    reply(text)

  } catch (err) {
    console.log("Runtime error:", err.message)
    await react(sock, jid, msg.key, "❌")
    reply("❌ Failed to get runtime")
  }
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

statuslist: async () => {
   if (!isOwner) return reply("❌ Owner only")
  if (!global.STATUS_DB?.length) return reply("📭 No saved statuses")

  let text = "📚 *SAVED STATUSES*\n\n"

  global.STATUS_DB.forEach((s, i) => {
    text += `${i + 1}. ${s.type.toUpperCase()} - ${new Date(s.time).toLocaleString()}\n`
  })

  return reply(text)
},

autostatus: async () => {
   if (!isOwner) return reply("❌ Owner only")
  global.AUTO_SAVE_STATUS = !global.AUTO_SAVE_STATUS
  return reply(`⚙️ Auto Status Save: ${global.AUTO_SAVE_STATUS ? "ON" : "OFF"}`)
},

statusfilter: async () => {
  if (!isOwner) return reply("❌ Owner only")

  let number = args[0]?.replace(/\D/g, "")
  if (!number) return reply("❌ Usage: .statusfilter 23480xxxxxxx")

  if (number.startsWith("0")) {
    number = "234" + number.slice(1)
  }

  const jid = number + "@s.whatsapp.net"

  if (!global.ALLOWED_STATUS_CONTACTS) global.ALLOWED_STATUS_CONTACTS = []

  global.ALLOWED_STATUS_CONTACTS.push(jid)

  return reply(`👥 Added to allowed list: ${number}`)
},

statusclear: async () => {
   if (!isOwner) return reply("❌ Owner only")
  global.STATUS_DB = []
  global.STATUS_HASH = new Set()
  return reply("🧹 All saved statuses cleared")
},

      // ===== MENU =====
      
menu: async () => {
  
  const sender =
  normalizeJid(
    msg.key.participant ||
    msg.key.remoteJid ||
    ""
  )

  const header = getHeader()
  
const userRole = getUserRole({
  isOwner,
  isAdmin,
  isBot,
  isGroup
})
    
  const userName =
    msg.pushName ||
    sender.split("@")[0]


    function formatRuntime(seconds) {
  seconds = Number(seconds)

    const d = Math.floor(seconds / (3600 * 24))
  const h = Math.floor(seconds % (3600 * 24) / 3600)
  const m = Math.floor(seconds % 3600 / 60)
  const s = Math.floor(seconds % 60)

  return [
    d ? `${d}d` : "",
    h ? `${h}h` : "",
    m ? `${m}m` : "",
    `${s}s`
  ].filter(Boolean).join(" ")

    }

  const uptime = formatRuntime(process.uptime())
 const from = msg.key.remoteJid 


  // const pushName =
  //   msg.pushName ||
  //   msg.name ||
  //   "Unknown User"

 // ===== ROLE SYSTEM =====
  // let role = "👤 User"

  // try {
  //   if (from.endsWith("@g.us")) {
  //     const metadata = await sock.groupMetadata(from)

  //     const participant = metadata.participants.find(
  //       p => p.id === userJid
  //     )

  //     if (participant) {
  //       if (participant.admin === "superadmin") {
  //         role = "👑 Group Owner"
  //       } else if (participant.admin === "admin") {
  //         role = "🛡️ Group Admin"
  //       } else {
  //         role = "👤 Member"
  //       }
  //     }
  //   }
  // } catch {
  //   role = "👤 User"
  // }

// 📸 RANDOM SMALL MENU IMAGE
// const randomImage = `https://picsum.photos/seed/menu${Date.now()}/500/350`

 // 🌍 Realistic wallpapers:
const bg = await getPremiumMenuBackground()



  // 📊 SYSTEM INFO
  // const uptime = process.uptime()
  // const uptimeText = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`

  const memory = (process.memoryUsage().rss / 1024 / 1024).toFixed(2)

  const totalRAM = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2)
  const freeRAM = (os.freemem() / 1024 / 1024 / 1024).toFixed(2)

  const time = moment().tz("Africa/Lagos").format("HH:mm:ss")
  const date = moment().tz("Africa/Lagos").format("DD/MM/YYYY")

  // const ownerText = BOT_OWNERS.length
  //   ? BOT_OWNERS.map(o => `• @${o.split("@")[0]}`).join("\n")
  //   : "• No owners set"

  // // 🌅 GREETING SYSTEM
  // const hour = new Date().getHours()
  // const greet =
  //   hour < 12 ? "🌅 Good Morning" :
  //   hour < 16 ? "🌞 Good Afternoon" :
  //               "🌙 Good Evening"

  // ================= GREETING SYSTEM =================
function getGreeting() {
  const hour = new Date().getHours()

  if (hour >= 5 && hour < 12) {
    return "🌅 Good Morning"
  }

  if (hour >= 12 && hour < 17) {
    return "☀️ Good Afternoon"
  }

  if (hour >= 17 && hour < 21) {
    return "🌆 Good Evening"
  }

  return "🌙 Good Night"
}

// ================= OPTIONAL THEME LABEL =================
function getThemeLabel() {
  const hour = new Date().getHours()

  if (hour >= 5 && hour < 12) return "Morning Serenity"
  if (hour >= 12 && hour < 17) return "Golden Daylight"
  if (hour >= 17 && hour < 21) return "Sunset Vibes"

  return "Moonlight Dreams"
}


 if (!isOwner) return reply("❌ Owner only")
  

  // 📜 MENU TEXT

   let menuText = `
╔═══━━━── • ──━━━═══╗
 ${header}
╚═══━━━── • ──━━━═══╝

${getGreeting()}, *${userName}* 👋

🕒 ${time}
📅 ${date}
🎨 Theme: ${getThemeLabel()}
🪪 Role: ${userRole}
👑 Owners: ${BOT_OWNERS.length}
📊 Messages: ${BOT_STATS.messages}
⚡ Runtime: ${uptime}
🛠️ Mode: ${settings?.mode || "public"}
🔰 Prefix: ${PREFIX}

━━━━━━━━━━━━━━━━━━
`

 for (const category in PREMIUM_MENU_SECTIONS) {
  menuText += `\n╭─❍ ${category}\n`

  for (const command of PREMIUM_MENU_SECTIONS[category]) {
    const desc = COMMAND_DESCRIPTIONS[command] || "No description"

    menuText += `│ ${PREFIX}${command}\n`
    menuText += `│ ➜ ${desc}\n`
  }
  menuText += `╰────────────\n`
}
    menuText += `
━━━━━━━━━━━━━━━━━━━━
╔═══━━━── • ──━━━═══╗
                POWERED BY GIBBOR  
╚═══━━━── • ──━━━═══╝
`
 // ===== SEND MENU WITH WORKING IMAGE =====
  await sock.sendMessage(from, {
   image: { url: bg }, 
   caption: menuText, 
   mentions: [sender] 
  }, { quoted: msg }) 
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
    await react("✅")

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