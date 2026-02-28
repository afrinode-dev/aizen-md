const dotenv = require('dotenv');
dotenv.config();

module.exports = {
    OWNER_NUMBER: process.env.OWNER_NUMBER || "24176209643",
    OWNER_NAME: "➵ 𝙹𝚞𝚜𝚝 𝚕𝚒𝚘𝚗𝚎𝚕 ➵",
    PREFIX: process.env.PREFIX || ".",
    SESSION_ID: "afrinode-dev/AIZEN-MD_37819aa089a2bbcf3fb6878cd407eebb",
    BOT_NAME: process.env.BOT_NAME || "AIZEN",
    DOSSIER_AUTH: process.env.SESSION_DIR || "./session",
    BOT_THEME: 'AIZEN',
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
    RECONNECT_DELAY: process.env.RECONNECT_DELAY || "5000"
};