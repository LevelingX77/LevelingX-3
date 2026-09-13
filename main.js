require("dotenv").config();

const express = require("express");
const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    UserSelectMenuBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    AuditLogEvent
} = require("discord.js");

const {
    MongoClient,
    ServerApiVersion,
    ObjectId
} = require("mongodb");

// ======================================================
// 1. UI CONFIG
// ======================================================

const UI_CONFIG = {
    embed: {
        title: "ฝากบอก",
        description:
            "มีอะไรอยู่ในใจ แต่ไม่กล้าบอก ลองใช้บอทตัวนี้เป็นตัวแทนในการบอกได้ โดยที่อีกฝ่ายจะไม่รู้ว่าเราคือใคร",
        color: "#FF69B4",
        image:
            "https://cdn.discordapp.com/attachments/1547940188158693501/1548642382608863302/34cb014a-4252-4824-a25f-6950f143c613.gif?ex=6aa7cd1c&is=6aa67b9c&hm=231b55856606c7c0f7f853d82f1d5fe5073d5563d7d5617e289e9cc14cc1980e&",
        thumbnail: "",
        footer: "Developer : tin.py"
    },

    button: {
        label: "ฝากบอก",
        emoji: "📩",
        style: "Primary"
    }
};

// ======================================================
// 2. VALIDATE UI CONFIG
// ======================================================

function validateUIConfig() {
    console.log("🔄 Validating UI_CONFIG...");

    const {
        title,
        description,
        color,
        image,
        thumbnail,
        footer
    } = UI_CONFIG.embed;

    const {
        label,
        style
    } = UI_CONFIG.button;

    if (title && title.length > 256) {
        throw new Error("UI_CONFIG Error: title ยาวเกิน 256 ตัวอักษร");
    }

    if (description && description.length > 4096) {
        throw new Error("UI_CONFIG Error: description ยาวเกิน 4096 ตัวอักษร");
    }

    if (footer && footer.length > 2048) {
        throw new Error("UI_CONFIG Error: footer ยาวเกิน 2048 ตัวอักษร");
    }

    if (label && label.length > 80) {
        throw new Error("UI_CONFIG Error: button label ยาวเกิน 80 ตัวอักษร");
    }

    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        throw new Error(
            "UI_CONFIG Error: color ต้องเป็น HEX เช่น #5865F2"
        );
    }

    if (image) {
        try {
            new URL(image);
        } catch {
            throw new Error(
                "UI_CONFIG Error: image ต้องเป็น URL ที่ถูกต้อง"
            );
        }
    }

    if (thumbnail) {
        try {
            new URL(thumbnail);
        } catch {
            throw new Error(
                "UI_CONFIG Error: thumbnail ต้องเป็น URL ที่ถูกต้อง"
            );
        }
    }

    const validStyles = [
        "Primary",
        "Secondary",
        "Success",
        "Danger"
    ];

    if (!validStyles.includes(style)) {
        throw new Error(
            `UI_CONFIG Error: button style ต้องเป็น ${validStyles.join(", ")}`
        );
    }

    console.log("✅ UI_CONFIG ถูกต้อง");
}

validateUIConfig();

// ======================================================
// 3. ENVIRONMENT VARIABLES
// ======================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = Number(process.env.PORT) || 10000;
const BOT_OWNER_ID = process.env.BOT_OWNER_ID;

if (!TOKEN || !CLIENT_ID || !MONGODB_URI) {
    console.error("❌ Missing required environment variables");
    console.error(
        "Required: DISCORD_TOKEN, CLIENT_ID, MONGODB_URI"
    );
    process.exit(1);
}

// Discord snowflake ID = ตัวเลขล้วน 17-20 หลัก
// CLIENT_ID ต้องเป็น "Application ID" จาก Discord Developer Portal
// (Developer Portal > Your App > General Information > Application ID)
// ไม่ใช่ Bot Token และไม่ใช่ Public Key — ถ้าใส่ผิดตัว Slash Command จะไม่ขึ้นแม้ register สำเร็จ
const SNOWFLAKE_REGEX = /^\d{17,20}$/;

if (!SNOWFLAKE_REGEX.test(CLIENT_ID)) {
    console.error(
        "❌ CLIENT_ID รูปแบบไม่ถูกต้อง — ต้องเป็นตัวเลขล้วน 17-20 หลัก (Application ID)"
    );
    console.error(
        "   ตรวจได้ที่ Discord Developer Portal > Your App > General Information > Application ID"
    );
    process.exit(1);
}

// BOT_OWNER_ID ไม่ใช่ required env var แบบ hard requirement เพื่อไม่ให้บอทที่ใช้งานอยู่แล้ว
// crash โดยไม่จำเป็นถ้ายังไม่ได้ตั้งค่า แต่คำสั่ง Owner-only (/stats, /servers, /botstats)
// จะถูกปฏิเสธเสมอถ้าไม่มีค่านี้ (ดูฟังก์ชัน isBotOwner ด้านล่าง)
if (!BOT_OWNER_ID) {
    console.error(
        "⚠️ BOT_OWNER_ID ไม่ได้ถูกตั้งค่าใน Environment Variables"
    );
    console.error(
        "   → คำสั่ง Owner-only (/stats, /servers, /botstats) จะถูกปิดใช้งานจนกว่าจะตั้งค่านี้"
    );
} else if (!SNOWFLAKE_REGEX.test(BOT_OWNER_ID)) {
    console.error(
        "⚠️ BOT_OWNER_ID รูปแบบไม่ถูกต้อง — ต้องเป็นตัวเลขล้วน 17-20 หลัก (Discord User ID)"
    );
    console.error(
        "   → คำสั่ง Owner-only จะถูกปิดใช้งานจนกว่าจะแก้ไขค่านี้ให้ถูกต้อง"
    );
}

// ฟังก์ชันตรวจสอบว่า user เป็น Bot Owner หรือไม่
// ใช้ interaction.user.id === process.env.BOT_OWNER_ID เท่านั้น
// ห้ามใช้ username / displayName / nickname / Administrator / Manage Server / role ใดๆ
function isBotOwner(userId) {
    if (!BOT_OWNER_ID) {
        return false;
    }

    if (!SNOWFLAKE_REGEX.test(BOT_OWNER_ID)) {
        return false;
    }

    return userId === BOT_OWNER_ID;
}

async function rejectIfNotOwner(interaction) {
    if (isBotOwner(interaction.user.id)) {
        return false;
    }

    const replyPayload = {
        content: "คำสั่งนี้ใช้ได้เฉพาะ Bot Owner เท่านั้น",
        ephemeral: true
    };

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(replyPayload);
        } else {
            await interaction.reply(replyPayload);
        }
    } catch (error) {
        console.error(
            "Owner-check reply error:",
            sanitizeErrorEarly(error)
        );
    }

    return true;
}

// sanitizeError ยังไม่ถูก define ตอนนี้ (มันอยู่หัวข้อ 6 ด้านล่าง)
// ใช้ตัวช่วยเบื้องต้นสำหรับจุดนี้เพื่อไม่ต้องย้ายโค้ดทั้งหมด
function sanitizeErrorEarly(error) {
    if (!error) {
        return "Unknown Error";
    }

    return String(error.message || error);
}

if (
    !MONGODB_URI.startsWith("mongodb://") &&
    !MONGODB_URI.startsWith("mongodb+srv://")
) {
    console.error(
        "❌ MONGODB_URI รูปแบบไม่ถูกต้อง"
    );
    process.exit(1);
}

// ======================================================
// 4. EXPRESS SERVER
// ======================================================

const app = express();

app.get("/", (req, res) => {
    res.status(200).send("77 Community Bot is online.");
});

app.get("/health", (req, res) => {
    const discordConnected =
        typeof client !== "undefined" &&
        client?.isReady?.() === true;

    const databaseConnected =
        typeof isMongoConnected === "function" &&
        isMongoConnected();

    let status = "ok";

    if (!discordConnected && !databaseConnected) {
        status = "error";
    } else if (!discordConnected || !databaseConnected) {
        status = "degraded";
    }

    const httpStatus = status === "error" ? 503 : 200;

    res.status(httpStatus).json({
        status,
        discord: discordConnected ? "connected" : "disconnected",
        database: databaseConnected ? "connected" : "disconnected",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `🌐 Web server listening on port ${PORT}`
    );
});

// ======================================================
// 5. MONGODB
// ======================================================

const mongo = new MongoClient(MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
    },
    tls: true,
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
    minPoolSize: 2,
    retryWrites: true,
    retryReads: true
});

let db;
let guildSetups;
let anonymousMessages;
let botGuildsCollection;
let botStatsCollection;

// สถานะการเชื่อมต่อ MongoDB "จริง" — ไม่ใช่แค่ตัวแปร db มีค่าอยู่หรือไม่
// mongoConnected จะถูกอัปเดตจาก event ของ MongoClient เท่านั้น (serverHeartbeatSucceeded /
// close / error / topologyClosed) เพื่อสะท้อนสถานะ connection ที่แท้จริง
// แก้ปัญหาเดิมที่ใช้ "if (db) return;" ซึ่งทำให้ reconnect ไม่ทำงานเพราะ db ยังมีค่าอยู่
// แม้ connection จริงจะตายไปแล้ว
let mongoConnected = false;

// ใช้ประสาน timing ระหว่าง MongoDB connect กับ Discord ready — เพราะสองอย่างนี้
// เชื่อมต่อแบบ async แยกกัน ไม่รู้ว่าอันไหนจะพร้อมก่อน ฟังก์ชัน syncAllSetupPanels()
// ต้องรอทั้งคู่พร้อมก่อนถึงจะรันได้ (ต้องมีทั้ง guildSetups collection และ client login แล้ว)
let setupPanelsSyncedOnce = false;

function isMongoConnected() {
    return mongoConnected === true;
}

mongo.on("serverHeartbeatSucceeded", () => {
    mongoConnected = true;
});

mongo.on("serverHeartbeatFailed", () => {
    mongoConnected = false;
    scheduleDatabaseReconnect();
});

mongo.on("close", () => {
    console.error("⚠️ MongoDB connection closed");
    mongoConnected = false;
    scheduleDatabaseReconnect();
});

mongo.on("error", error => {
    console.error(
        "⚠️ MongoDB client error:",
        sanitizeErrorEarly(error)
    );
    mongoConnected = false;
    scheduleDatabaseReconnect();
});

mongo.on("topologyClosed", () => {
    mongoConnected = false;
    scheduleDatabaseReconnect();
});

// ======================================================
// 6. ERROR SANITIZER
// ======================================================

function scrubMongoCredentials(text) {
    return String(text ?? "").replace(
        /mongodb(?:\+srv)?:\/\/[^@]+@/g,
        "mongodb+srv://<CREDENTIALS_HIDDEN>@"
    );
}

// sanitizeError: คืนข้อความ Error แบบสั้น (ไม่มี Mongo credentials) ใช้แสดงผลทั่วไป
function sanitizeError(error) {
    if (!error) {
        return "Unknown Error";
    }

    return scrubMongoCredentials(error.message || String(error));
}

// logDetailedError: ใช้ตอน Log ลง Render สำหรับจุดที่ต้องการรายละเอียดครบ
// (ชื่อคำสั่ง/ขั้นตอน, message, code, HTTP status, รายละเอียดจาก Discord API,
// stack trace) ตามข้อกำหนด — ไม่ใช้ค่าที่ฟังก์ชันนี้คืนไปแสดงให้ผู้ใช้เห็นเด็ดขาด
function logDetailedError(context, error) {
    if (!error) {
        console.error(`❌ [${context}] Unknown Error (no error object)`);
        return;
    }

    const parts = [`❌ [${context}]`];

    parts.push(`message=${scrubMongoCredentials(error.message || String(error))}`);

    if (error.code !== undefined) {
        parts.push(`code=${error.code}`);
    }

    const httpStatus = error.status ?? error.httpStatus;
    if (httpStatus !== undefined) {
        parts.push(`httpStatus=${httpStatus}`);
    }

    if (error.rawError) {
        try {
            parts.push(`discordApi=${scrubMongoCredentials(JSON.stringify(error.rawError))}`);
        } catch {
            // ignore stringify failure
        }
    }

    console.error(parts.join(" | "));

    if (error.stack) {
        console.error(scrubMongoCredentials(error.stack));
    }
}

// ======================================================
// 7. CONNECT DATABASE
// ======================================================

// ป้องกันไม่ให้มีการเรียก connectDatabase() พร้อมกันหลายชุด
// (เช่น background reconnect ชนกับ manual retry) ซึ่งจะทำให้เกิด
// reconnect loop ซ้อนกันหลายตัวได้
let connectDatabaseInFlight = false;

async function connectDatabase(
    maxRetries = 5,
    retryDelay = 5000
) {
    if (connectDatabaseInFlight) {
        console.log(
            "ℹ️ MongoDB กำลังเชื่อมต่ออยู่แล้ว ข้ามการเรียกซ้ำ"
        );
        return isMongoConnected();
    }

    connectDatabaseInFlight = true;

    try {
        for (
            let attempt = 1;
            attempt <= maxRetries;
            attempt++
        ) {
            try {
                console.log(
                    `🔄 Connecting to MongoDB Atlas (${attempt}/${maxRetries})...`
                );

                await mongo.connect();

                db = mongo.db("77community");

                await db.command({
                    ping: 1
                });

                console.log("✅ MongoDB Ping successful");

                guildSetups =
                    db.collection("guild_setups");

                anonymousMessages =
                    db.collection("anonymous_messages");

                botGuildsCollection =
                    db.collection("bot_guilds");

                botStatsCollection =
                    db.collection("bot_stats");

                await guildSetups.createIndex(
                    {
                        guildId: 1
                    },
                    {
                        unique: true
                    }
                );

                await anonymousMessages.createIndex({
                    guildId: 1,
                    createdAt: -1
                });

                await anonymousMessages.createIndex({
                    recipientId: 1,
                    replied: 1
                });

                await botGuildsCollection.createIndex(
                    {
                        guildId: 1
                    },
                    {
                        unique: true
                    }
                );

                await botStatsCollection.createIndex(
                    {
                        key: 1
                    },
                    {
                        unique: true
                    }
                );

                console.log(
                    "✅ MongoDB connected & indexes ready"
                );

                mongoConnected = true;

                // เผื่อ Discord Client login เสร็จ (ClientReady ยิงไปแล้ว) ก่อนที่
                // MongoDB จะเชื่อมต่อสำเร็จ — ต้องมาเรียก sync ตรงนี้อีกที เพราะ
                // ตอน ClientReady เรียก trySyncSetupPanelsOnce() ไปแล้ว guildSetups
                // อาจยังไม่มีค่า (ฟังก์ชันเองมี setupPanelsSyncedOnce กันไม่ให้ทำซ้ำ)
                trySyncSetupPanelsOnce();

                return true;
            } catch (error) {
                mongoConnected = false;

                console.error(
                    `❌ MongoDB attempt ${attempt} failed:`,
                    sanitizeError(error)
                );

                if (attempt === maxRetries) {
                    // สำคัญ: ห้ามให้ MongoDB ล่มพา Discord Bot ล่มไปด้วย
                    // Bot ยัง login และ register slash commands ได้ตามปกติ
                    // ฟีเจอร์ที่ต้องใช้ฐานข้อมูล (บันทึก setup, เก็บข้อความฝากบอก ฯลฯ)
                    // จะแจ้งผู้ใช้ว่าใช้งานไม่ได้ชั่วคราวแทนที่จะทำให้ทั้งบอทปิดตัว
                    console.error(
                        "❌ ไม่สามารถเชื่อมต่อ MongoDB ได้หลังจากลองครบทุกครั้งแล้ว"
                    );
                    console.error(
                        "   ⚠️ Discord Bot จะยัง login และ register slash commands ต่อไปตามปกติ"
                    );
                    console.error(
                        "   ⚠️ แต่ฟีเจอร์ที่ต้องใช้ฐานข้อมูล (setup / setchannel / ฝากบอก) จะใช้งานไม่ได้จนกว่าจะเชื่อมต่อ MongoDB สำเร็จ"
                    );

                    scheduleDatabaseReconnect();

                    return false;
                }

                console.log(
                    `⏳ Retrying in ${retryDelay / 1000} seconds...`
                );

                await new Promise(resolve =>
                    setTimeout(resolve, retryDelay)
                );
            }
        }

        return false;
    } finally {
        connectDatabaseInFlight = false;
    }
}

// ======================================================
// 7B. BACKGROUND MONGODB RECONNECT
// พยายามเชื่อมต่อ MongoDB ใหม่เรื่อยๆ แบบไม่บล็อก Discord Bot
// ======================================================

let reconnectScheduled = false;
let reconnectAttemptCount = 0;

function scheduleDatabaseReconnect(delayMs) {
    if (reconnectScheduled) {
        return;
    }

    if (isMongoConnected()) {
        // connection จริงยังใช้งานได้ ไม่ต้อง schedule reconnect
        return;
    }

    reconnectScheduled = true;

    // Exponential backoff: 1x, 2x, 4x, 8x... สูงสุด 5 นาที
    // เพื่อไม่ให้ยิง request ไปที่ MongoDB Atlas ถี่เกินไปตอนมันล่มยาว
    const baseDelay = delayMs || 15000;
    const backoffDelay = Math.min(
        baseDelay * Math.pow(2, reconnectAttemptCount),
        5 * 60 * 1000
    );

    console.log(
        `⏳ จะลองเชื่อมต่อ MongoDB ใหม่ในอีก ${Math.round(backoffDelay / 1000)} วินาที`
    );

    setTimeout(async () => {
        reconnectScheduled = false;

        // ตรวจสอบ connection จริงแทนการเช็คแค่ว่าตัวแปร db มีค่าอยู่หรือไม่
        // เพราะ db อาจยังชี้ไป object เดิมแม้ connection จริงจะตายไปแล้ว
        if (isMongoConnected()) {
            reconnectAttemptCount = 0;
            return;
        }

        console.log(
            "🔄 กำลังลองเชื่อมต่อ MongoDB อีกครั้งใน background..."
        );

        reconnectAttemptCount += 1;

        const success = await connectDatabase(1, 0);

        if (success) {
            reconnectAttemptCount = 0;
        } else {
            scheduleDatabaseReconnect(baseDelay);
        }
    }, backoffDelay);
}

// ======================================================
// 8. DISCORD CLIENT
// ======================================================

// หมายเหตุสำคัญ (ฟีเจอร์ /announce, /update): เพิ่ม GatewayIntentBits.GuildMembers
// เพราะระบบประกาศ DM ต้องคำนวณกลุ่มผู้รับ (สมาชิกทุกคน / Admin / Manage Guild /
// เจ้าของเซิร์ฟเวอร์) จาก member cache ของแต่ละเซิร์ฟเวอร์ ซึ่งจำเป็นต้องมี Intent นี้
// ไม่เช่นนั้น guild.members.cache จะมีแค่บอทเอง (หรือสมาชิกที่ cache ไว้จาก event อื่น)
// *** สำคัญ: ต้องไปเปิด "SERVER MEMBERS INTENT" ที่ Discord Developer Portal ด้วย
// (Developer Portal > Your App > Bot > Privileged Gateway Intents) ไม่งั้น client.login()
// จะ throw error ทันที (Used disallowed intents) ***
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ],

    partials: [
        Partials.Channel
    ]
});

// ======================================================
// 8B. DISCORD CLIENT RESILIENCE
// ป้องกันไม่ให้ Bot crash จาก error ธรรมดาของ Discord Gateway/API
// (disconnect ชั่วคราว, rate limit, shard error ฯลฯ)
// discord.js เองมี auto-reconnect ของ Gateway อยู่แล้ว หน้าที่ของ handler พวกนี้
// คือแค่ log ให้เห็นสถานะ ไม่ใช่ไปเขียน logic reconnect ซ้ำเอง
// ======================================================

client.on(Events.Error, error => {
    console.error(
        "⚠️ Discord Client Error:",
        sanitizeErrorEarly(error)
    );
});

client.on(Events.Warn, info => {
    console.warn("⚠️ Discord Client Warning:", info);
});

client.on(Events.ShardDisconnect, (event, shardId) => {
    console.error(
        `⚠️ Discord Shard ${shardId} disconnected (code: ${event?.code ?? "unknown"})`
    );
});

client.on(Events.ShardReconnecting, shardId => {
    console.log(`🔄 Discord Shard ${shardId} กำลัง reconnect...`);
});

client.on(Events.ShardResume, shardId => {
    console.log(`✅ Discord Shard ${shardId} resumed`);
});

client.on(Events.ShardError, (error, shardId) => {
    console.error(
        `⚠️ Discord Shard ${shardId} error:`,
        sanitizeErrorEarly(error)
    );
});

client.rest.on("rateLimited", info => {
    console.warn(
        `⚠️ Discord API Rate Limited: route=${info?.route ?? "unknown"} timeout=${info?.timeToReset ?? "?"}ms`
    );
});

// ======================================================
// 9. SLASH COMMANDS
// ======================================================

const commands = [
    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("สร้างระบบฝากบอก")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName("setchannel")
        .setDescription(
            "กำหนดช่องสำหรับรับข้อความฝากบอก"
        )
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription(
                    "เลือกช่องที่จะใช้รับข้อความฝากบอก"
                )
                .addChannelTypes(
                    ChannelType.GuildText
                )
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        )
        .setDMPermission(false),

    // /help เปิดให้ทุกคนใช้ได้ตามปกติ (ไม่มี setDefaultMemberPermissions)
    // อธิบายเฉพาะ /setup และ /setchannel เท่านั้น — ห้ามพูดถึง /owner-1, /owner-2,
    // /owner-3 เพราะเป็นคำสั่งลับสำหรับ Bot Owner เท่านั้น การใส่ไว้ใน /help
    // จะทำให้ผู้ใช้ทั่วไปรู้ว่ามีคำสั่งลับเหล่านี้อยู่
    new SlashCommandBuilder()
        .setName("help")
        .setDescription("วิธีการใช้บอท")
        .setDMPermission(true),

    // หมายเหตุ: /owner-1, /owner-2, /owner-3 ไม่ได้ตั้ง setDefaultMemberPermissions
    // เป็น Administrator เพราะ Owner ของบอทอาจไม่ใช่ Admin ในทุกเซิร์ฟเวอร์ที่บอทอยู่
    // การจำกัดสิทธิ์ทำที่ระดับ interaction.user.id === process.env.BOT_OWNER_ID
    // ตอน execute เท่านั้น (ดู isBotOwner) — ห้ามพึ่งพา Discord permission system
    // สำหรับคำสั่งกลุ่มนี้ เพราะ Owner ต้องใช้ได้ไม่ว่าจะอยู่ role ไหนก็ตาม
    // Mapping: owner-1 = stats ภาพรวม, owner-2 = server list (มี pagination),
    // owner-3 = botstats เชิงลึก — ชื่อ command กับ if-block ในตัว interaction
    // handler ต้องตรงกันเป๊ะเสมอ ไม่งั้นคำสั่งจะไม่ตอบสนองเลย (Discord จะขึ้นว่า
    // "The application did not respond" เพราะไม่มี branch ไหน match แล้วไม่มีการ
    // reply/defer ภายใน 3 วินาที)
    new SlashCommandBuilder()
        .setName("owner-1")
        .setDescription("...")
        .setDMPermission(true),

    new SlashCommandBuilder()
        .setName("owner-2")
        .setDescription("...")
        .setDMPermission(true),

    new SlashCommandBuilder()
        .setName("owner-3")
        .setDescription("...")
        .setDMPermission(true),

    // /announce, /update: เป็นคำสั่งลับสำหรับ Bot Owner เช่นเดียวกับ owner-1/2/3
    // (การจำกัดสิทธิ์จริงทำที่ isBotOwner/rejectIfNotOwner ตอน execute เท่านั้น
    // ไม่พึ่งพา setDefaultMemberPermissions เพราะ Owner อาจไม่ใช่ Admin ทุกเซิร์ฟเวอร์)
    new SlashCommandBuilder()
        .setName("announce")
        .setDescription("...")
        .setDMPermission(true),

    new SlashCommandBuilder()
        .setName("update")
        .setDescription("...")
        .setDMPermission(true)
].map(command => command.toJSON());

// ======================================================
// 10. REGISTER SLASH COMMANDS
// ======================================================

async function registerCommands() {
    const commandNames = commands
        .map(command => command.name)
        .join(", ");

    try {
        console.log(
            `🔄 Registering ${commands.length} slash command(s) [${commandNames}]`
        );
        console.log(
            `   → Target: Global Commands | Application ID: ${CLIENT_ID}`
        );

        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        const result = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        console.log(
            `✅ Slash commands registered สำเร็จ ${result.length} คำสั่ง (Global)`
        );
        console.log(
            `   คำสั่งที่ลงทะเบียน: ${result.map(c => "/" + c.name).join(", ")}`
        );
        console.log(
            "   ℹ️ Global Commands อาจใช้เวลาสักพัก (โดยทั่วไปไม่กี่นาที แต่บางครั้งนานถึง ~1 ชม.) กว่าจะกระจายไปครบทุก Server — ไม่ต้อง register ซ้ำ แค่รอ"
        );
    } catch (error) {
        console.error(
            "❌ Failed to register slash commands:",
            sanitizeError(error)
        );

        // ดึงรายละเอียด error จาก Discord REST API ให้ชัดเจนขึ้น
        // (error.status / error.code / error.rawError มักบอกสาเหตุตรงๆ)
        if (error.status) {
            console.error(
                `   HTTP Status: ${error.status}`
            );
        }

        if (error.code) {
            console.error(
                `   Discord Error Code: ${error.code}`
            );
        }

        if (error.rawError) {
            console.error(
                "   Discord Response:",
                JSON.stringify(error.rawError)
            );
        }

        if (error.status === 401) {
            console.error(
                "   → DISCORD_TOKEN ไม่ถูกต้องหรือหมดอายุ"
            );
        }

        if (error.status === 404) {
            console.error(
                "   → CLIENT_ID ไม่ถูกต้อง (ต้องเป็น Application ID จาก Developer Portal)"
            );
        }

        if (error.status === 403) {
            console.error(
                "   → Bot Token ไม่มีสิทธิ์แก้ไข Commands ของ Application นี้ — ตรวจว่า TOKEN กับ CLIENT_ID เป็นของแอปเดียวกัน"
            );
        }

        // ไม่ throw error ต่อ เพื่อไม่ให้ Discord Bot ทั้งตัวล่มเพียงเพราะ
        // register commands ล้มเหลวชั่วคราว (เช่น Discord API ดีเลย์/rate limit)
        // Bot ยัง login และตอบ interaction เดิม ๆ ได้ตามปกติ
    }
}

// ======================================================
// 11. SAFE FIELD
// Discord Embed field value max = 1024
// ======================================================

function safeField(
    value,
    fallback = "ไม่มี"
) {
    const text = String(
        value ?? fallback
    );

    if (text.length <= 1024) {
        return text;
    }

    return text.slice(0, 1021) + "...";
}

// ======================================================
// 12. EMBED BUILDERS
// ======================================================

function buildMainEmbed() {
    const embed = new EmbedBuilder()
        .setColor(UI_CONFIG.embed.color)
        .setTitle(UI_CONFIG.embed.title)
        .setDescription(
            UI_CONFIG.embed.description
        )
        .setFooter({
            text: UI_CONFIG.embed.footer
        });

    if (UI_CONFIG.embed.image) {
        embed.setImage(
            UI_CONFIG.embed.image
        );
    }

    if (UI_CONFIG.embed.thumbnail) {
        embed.setThumbnail(
            UI_CONFIG.embed.thumbnail
        );
    }

    return embed;
}

function buildMainButton() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "anonymous_send"
                )
                .setLabel(
                    UI_CONFIG.button.label
                )
                .setEmoji(
                    UI_CONFIG.button.emoji
                )
                .setStyle(
                    ButtonStyle[
                        UI_CONFIG.button.style
                    ]
                )
        );
}

function buildAnonymousMessageEmbed(
    record
) {
    return new EmbedBuilder()
        .setColor("#5865F2")
        .setTitle(
            "มีข้อความฝากบอกถึงคุณ"
        )
        .setDescription(
            `ถึง: <@${record.recipientId}>`
        )
        .addFields(
            {
                name: "ข้อความ",
                value: safeField(
                    record.originalMessage
                ),
                inline: false
            },
            {
                name: "คำใบ้",
                value: safeField(
                    record.clue
                ),
                inline: false
            }
        )
        .setFooter({
            text: "LevelingX"
        });
}

function buildReplyButton(
    recordId
) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `reply_button:${recordId}`
                )
                .setLabel("ตอบกลับ")
                .setEmoji("💬")
                .setStyle(
                    ButtonStyle.Primary
                )
        );
}

function buildRepliedEmbed(
    record,
    replyText
) {
    return new EmbedBuilder()
        .setColor("#57F287")
        .setTitle(
            "ข้อความนี้ถูกตอบกลับแล้ว"
        )
        .setDescription(
            `ถึง: <@${record.recipientId}>`
        )
        .addFields(
            {
                name: "ข้อความ",
                value: safeField(
                    record.originalMessage
                ),
                inline: false
            },
            {
                name: "คำใบ้",
                value: safeField(
                    record.clue
                ),
                inline: false
            },
            {
                name: "ข้อความตอบกลับ",
                value: safeField(
                    replyText
                ),
                inline: false
            }
        )
        .setFooter({
            text: "LevelingX • ตอบกลับแล้ว"
        });
}

function buildReplyNotificationEmbed(
    record,
    replyText
) {
    return new EmbedBuilder()
        .setColor("#57F287")
        .setTitle(
            "มีคนตอบกลับข้อความของคุณ"
        )
        .setDescription(
            "มีคนตอบกลับข้อความที่คุณฝากไว้แล้ว"
        )
        .addFields(
            {
                name: "ข้อความที่คุณฝาก",
                value: safeField(
                    record.originalMessage
                ),
                inline: false
            },
            {
                name: "คำใบ้",
                value: safeField(
                    record.clue
                ),
                inline: false
            },
            {
                name: "ข้อความตอบกลับ",
                value: safeField(
                    replyText
                ),
                inline: false
            }
        )
        .setFooter({
            text: "LevelingX"
        });
}

// ======================================================
// 13. GET GUILD SETUP
// ======================================================

async function getGuildSetup(
    guildId
) {
    if (!guildId) {
        return null;
    }

    if (!guildSetups) {
        return null;
    }

    try {
        return await guildSetups.findOne({
            guildId
        });
    } catch (error) {
        console.error(
            "Fetch guild setup error:",
            sanitizeError(error)
        );

        return null;
    }
}

// ======================================================
// 14. CHECK BOT PERMISSIONS
// ======================================================

function checkBotChannelPermissions(
    channel
) {
    if (!channel) {
        return {
            ok: false,
            reason: "ไม่พบช่อง"
        };
    }

    if (!channel.isTextBased()) {
        return {
            ok: false,
            reason: "ช่องที่เลือกไม่ใช่ช่องข้อความ"
        };
    }

    if (!channel.guild) {
        return {
            ok: false,
            reason: "ช่องนี้ไม่ใช่ช่องใน Server"
        };
    }

    const me =
        channel.guild.members.me;

    if (!me) {
        return {
            ok: false,
            reason:
                "ไม่สามารถตรวจสอบสิทธิ์บอทได้"
        };
    }

    const permissions =
        channel.permissionsFor(me);

    if (!permissions) {
        return {
            ok: false,
            reason:
                "ไม่สามารถตรวจสอบสิทธิ์ช่องได้"
        };
    }

    if (
        !permissions.has(
            PermissionFlagsBits.ViewChannel
        )
    ) {
        return {
            ok: false,
            reason:
                "บอทไม่มีสิทธิ์ View Channel"
        };
    }

    if (
        !permissions.has(
            PermissionFlagsBits.SendMessages
        )
    ) {
        return {
            ok: false,
            reason:
                "บอทไม่มีสิทธิ์ Send Messages"
        };
    }

    if (
        !permissions.has(
            PermissionFlagsBits.EmbedLinks
        )
    ) {
        return {
            ok: false,
            reason:
                "บอทไม่มีสิทธิ์ Embed Links"
        };
    }

    return {
        ok: true
    };
}

// ======================================================
// 15. EDIT PUBLIC MESSAGE
// ======================================================

async function editAnonymousChannelMessage(
    channelId,
    messageId,
    embed,
    components = [],
    retries = 3
) {
    for (
        let attempt = 1;
        attempt <= retries;
        attempt++
    ) {
        try {
            const channel =
                await client.channels.fetch(
                    channelId
                );

            if (
                !channel ||
                !channel.isTextBased()
            ) {
                return false;
            }

            const message =
                await channel.messages.fetch(
                    messageId
                );

            await message.edit({
                embeds: [embed],
                components
            });

            return true;
        } catch (error) {
            console.error(
                `⚠️ Edit message attempt ${attempt} failed:`,
                sanitizeError(error)
            );

            if (attempt === retries) {
                return false;
            }

            await new Promise(resolve =>
                setTimeout(
                    resolve,
                    1000 * attempt
                )
            );
        }
    }

    return false;
}

// ======================================================
// 15B. GLOBAL STATS (in-memory counter + periodic flush)
// ไม่เขียน MongoDB ทุก Interaction — นับใน memory แล้ว flush เป็นระยะแทน
// ======================================================

let commandsUsedCounter = 0;
let statsFlushInterval = null;

function incrementCommandsUsed() {
    commandsUsedCounter += 1;
}

async function flushGlobalStats() {
    if (!botStatsCollection) {
        return;
    }

    if (commandsUsedCounter === 0) {
        return;
    }

    const incrementBy = commandsUsedCounter;
    commandsUsedCounter = 0;

    try {
        await botStatsCollection.updateOne(
            { key: "global" },
            {
                $inc: {
                    commandsUsed: incrementBy
                },
                $set: {
                    guildCount: client.guilds.cache.size,
                    totalMembers: getTotalMemberCount(),
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );
    } catch (error) {
        // ถ้า flush ไม่สำเร็จ ให้บวกตัวนับกลับคืน เพื่อไม่ให้ข้อมูลหาย
        commandsUsedCounter += incrementBy;

        console.error(
            "⚠️ Flush global stats error:",
            sanitizeError(error)
        );
    }
}

async function getCommandsUsedTotal() {
    if (!botStatsCollection) {
        return commandsUsedCounter;
    }

    try {
        const doc = await botStatsCollection.findOne({
            key: "global"
        });

        return (doc?.commandsUsed || 0) + commandsUsedCounter;
    } catch (error) {
        console.error(
            "⚠️ Read global stats error:",
            sanitizeError(error)
        );

        return commandsUsedCounter;
    }
}

function startStatsFlushInterval() {
    if (statsFlushInterval) {
        clearInterval(statsFlushInterval);
    }

    statsFlushInterval = setInterval(() => {
        flushGlobalStats().catch(() => {});
    }, 5 * 60 * 1000);
}

// ======================================================
// 15C. GUILD STATS PERSISTENCE (bot_guilds collection)
// อัปเดตตอน Ready / guildCreate / guildDelete เท่านั้น ไม่เขียนทุกวินาที
// ======================================================

// Cache invite URL ต่อ guild ในหน่วยความจำ กัน createInvite ซ้ำทุกครั้งที่เรียก /servers
const inviteUrlCache = new Map();

async function getOrCreateGuildInvite(guild) {
    if (inviteUrlCache.has(guild.id)) {
        return inviteUrlCache.get(guild.id);
    }

    try {
        const me = guild.members.me;

        if (
            !me ||
            !me.permissions.has(
                PermissionFlagsBits.CreateInstantInvite
            )
        ) {
            return null;
        }

        const existingInvites = await guild
            .invites.fetch()
            .catch(() => null);

        let invite = existingInvites?.find(
            inv => inv.inviter?.id === client.user.id
        );

        if (!invite) {
            const targetChannel = guild.channels.cache.find(
                channel =>
                    channel.isTextBased() &&
                    !channel.isThread() &&
                    channel
                        .permissionsFor(me)
                        ?.has(
                            PermissionFlagsBits.CreateInstantInvite
                        )
            );

            if (!targetChannel) {
                return null;
            }

            invite = await targetChannel
                .createInvite({
                    maxAge: 0,
                    maxUses: 0,
                    unique: false
                })
                .catch(() => null);
        }

        if (!invite) {
            return null;
        }

        const url = `https://discord.gg/${invite.code}`;

        inviteUrlCache.set(guild.id, url);

        return url;
    } catch (error) {
        console.error(
            "⚠️ Create invite error:",
            sanitizeError(error)
        );

        return null;
    }
}

async function upsertGuildStats(guild) {
    if (!botGuildsCollection || !guild) {
        return;
    }

    try {
        const inviteUrl = await getOrCreateGuildInvite(guild);

        await botGuildsCollection.updateOne(
            { guildId: guild.id },
            {
                $set: {
                    guildId: guild.id,
                    guildName: guild.name,
                    memberCount: guild.memberCount || 0,
                    iconUrl: guild.iconURL() || null,
                    inviteUrl: inviteUrl || null,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    joinedAt: guild.joinedAt || new Date()
                }
            },
            { upsert: true }
        );
    } catch (error) {
        console.error(
            "⚠️ Upsert guild stats error:",
            sanitizeError(error)
        );
    }
}

async function removeGuildStats(guildId) {
    inviteUrlCache.delete(guildId);

    if (!botGuildsCollection || !guildId) {
        return;
    }

    try {
        await botGuildsCollection.deleteOne({ guildId });
    } catch (error) {
        console.error(
            "⚠️ Remove guild stats error:",
            sanitizeError(error)
        );
    }
}

async function syncAllGuildStats() {
    if (!botGuildsCollection) {
        return;
    }

    // ทำทีละ guild แบบ sequential เพื่อไม่ยิง MongoDB write/Discord API พร้อมกันจำนวนมาก
    // (สำคัญบน Render Free ที่ CPU/Network จำกัด)
    for (const guild of client.guilds.cache.values()) {
        await upsertGuildStats(guild);
    }
}

// ======================================================
// 15C-2. AUTO-SYNC SETUP PANEL EMBEDS
// เมื่อแก้ไข UI_CONFIG ในโค้ด (เช่น เปลี่ยนรูปภาพ/ข้อความ embed) แล้ว deploy ใหม่
// ฟังก์ชันนี้จะไล่อัปเดต embed ของหน้าต่างฝากบอกในทุกเซิร์ฟเวอร์ที่เคยตั้งค่า
// /setup ไว้แล้วโดยอัตโนมัติตอนบอทเริ่มทำงาน แอดมินแต่ละเซิร์ฟเวอร์ไม่ต้องกด
// /setup ซ้ำเองทุกครั้งที่มีการแก้ embed
// ======================================================

async function syncAllSetupPanels() {
    if (!guildSetups) {
        return;
    }

    // Build embed/button ครั้งเดียวจาก UI_CONFIG ล่าสุด แล้วใช้ซ้ำกับทุกเซิร์ฟเวอร์
    const embed = buildMainEmbed();
    const button = buildMainButton();

    let cursor;

    try {
        cursor = guildSetups.find({
            panelChannelId: { $exists: true, $ne: null },
            panelMessageId: { $exists: true, $ne: null }
        });
    } catch (error) {
        console.error(
            "⚠️ Query setup panels error:",
            sanitizeError(error)
        );

        return;
    }

    let updated = 0;
    let failed = 0;

    try {
        for await (const setup of cursor) {
            // ใช้ retries: 1 เพื่อไม่ยิง API ซ้ำหนักเกินไปตอน sync ทีเดียวหลายเซิร์ฟเวอร์
            // ถ้าพลาดรอบนี้ จะลองใหม่อัตโนมัติตอน deploy ครั้งถัดไป
            const success = await editAnonymousChannelMessage(
                setup.panelChannelId,
                setup.panelMessageId,
                embed,
                [button],
                1
            );

            if (success) {
                updated += 1;
            } else {
                failed += 1;
            }

            // หน่วงเล็กน้อยระหว่างแต่ละเซิร์ฟเวอร์ กัน Discord rate limit
            // เมื่อมีหลายเซิร์ฟเวอร์ที่ตั้งค่าไว้พร้อมกัน
            await new Promise(resolve =>
                setTimeout(resolve, 300)
            );
        }
    } catch (error) {
        console.error(
            "⚠️ Sync setup panels cursor error:",
            sanitizeError(error)
        );
    }

    if (updated > 0 || failed > 0) {
        console.log(
            `🖼️ Sync setup panel embeds: สำเร็จ ${updated} เซิร์ฟเวอร์, ล้มเหลว ${failed} เซิร์ฟเวอร์ (message ถูกลบ/ไม่มีสิทธิ์เข้าถึง)`
        );
    }
}

// เรียก syncAllSetupPanels() ครั้งเดียวหลังจากทั้ง MongoDB (guildSetups collection)
// และ Discord Client (login แล้ว) พร้อมทั้งคู่ — เพราะสองอย่างนี้เชื่อมต่อแบบ async
// แยกกันคนละจังหวะ ไม่รู้ล่วงหน้าว่าอันไหนจะพร้อมก่อน จึงต้องเรียกฟังก์ชันนี้ทั้งจาก
// ClientReady และจากตอน MongoDB connect สำเร็จ (ดู connectDatabase) เพื่อให้ไม่ว่า
// อันไหนพร้อมทีหลัง sync ก็จะยังทำงานจนได้ และ setupPanelsSyncedOnce กันไม่ให้รันซ้ำ
function trySyncSetupPanelsOnce() {
    if (setupPanelsSyncedOnce) {
        return;
    }

    if (!guildSetups) {
        return;
    }

    if (!client.isReady()) {
        return;
    }

    setupPanelsSyncedOnce = true;

    syncAllSetupPanels().catch(error => {
        console.error(
            "⚠️ Sync setup panels error:",
            sanitizeError(error)
        );
    });
}

// ======================================================
// 15D. BOT PRESENCE ROTATION
// สลับข้อความ "Watching X Servers" / "Watching X Members" ทุก ~15 วินาที
// โดยใช้ client.guilds.cache เท่านั้น ไม่ fetch สมาชิกเพิ่ม
// ======================================================

function getTotalMemberCount() {
    return client.guilds.cache.reduce(
        (total, guild) => total + (guild.memberCount || 0),
        0
    );
}

let presenceInterval = null;
let presenceShowingMembers = false;

function updatePresenceOnce() {
    try {
        const serverCount = client.guilds.cache.size;
        const memberCount = getTotalMemberCount();

        const text = presenceShowingMembers
            ? `👥 ${memberCount.toLocaleString()} Members`
            : `🏠 ${serverCount.toLocaleString()} Servers`;

        presenceShowingMembers = !presenceShowingMembers;

        client.user?.setActivity(text, {
            type: 3 // Watching
        });
    } catch (error) {
        console.error(
            "⚠️ Update presence error:",
            sanitizeError(error)
        );
    }
}

function startPresenceRotation() {
    // สำคัญ: ต้อง clear interval เดิมก่อนเสมอ ป้องกันไม่ให้เกิด interval
    // ซ้อนกันหลายตัวจากการเรียกจากหลาย event (ready / guildCreate / guildDelete)
    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
    }

    updatePresenceOnce();

    presenceInterval = setInterval(
        updatePresenceOnce,
        15000
    );
}

// ======================================================
// 15E. STATS / SERVERS HELPERS
// ======================================================

function formatUptime(totalSeconds) {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const parts = [];

    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(" ");
}

const SERVERS_PER_PAGE = 5;

async function buildServersPage(page) {
    const guilds = Array.from(client.guilds.cache.values());

    const totalPages = Math.max(
        1,
        Math.ceil(guilds.length / SERVERS_PER_PAGE)
    );

    const safePage = Math.min(
        Math.max(page, 0),
        totalPages - 1
    );

    const start = safePage * SERVERS_PER_PAGE;
    const pageGuilds = guilds.slice(
        start,
        start + SERVERS_PER_PAGE
    );

    const embed = new EmbedBuilder()
        .setColor("#FEE75C")
        .setTitle("🗂️ Server List (Owner Only)")
        .setFooter({
            text: `Page ${safePage + 1} / ${totalPages} • ${guilds.length} servers total`
        })
        .setTimestamp();

    if (pageGuilds.length === 0) {
        embed.setDescription("ไม่มีเซิร์ฟเวอร์");
    }

    for (const guild of pageGuilds) {
        // ใช้ invite ที่ cache ไว้แทนการสร้างใหม่ทุกครั้งที่เรียก /servers
        let inviteUrl = inviteUrlCache.get(guild.id);

        if (inviteUrl === undefined) {
            inviteUrl = await getOrCreateGuildInvite(guild);
        }

        embed.addFields({
            name: `${guild.name}`,
            value: [
                `👥 Members: ${(guild.memberCount || 0).toLocaleString()}`,
                `🆔 Guild ID: \`${guild.id}\``,
                `🔗 Invite: ${inviteUrl ? inviteUrl : "Invite unavailable"}`
            ].join("\n"),
            inline: false
        });
    }

    const components = [];

    if (totalPages > 1) {
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `servers_page:${safePage - 1}`
                    )
                    .setLabel("Previous")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage === 0),

                new ButtonBuilder()
                    .setCustomId(
                        `servers_page:${safePage + 1}`
                    )
                    .setLabel("Next")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(safePage >= totalPages - 1)
            )
        );
    }

    return { embed, components };
}

// ======================================================
// 15F. TEXT SANITIZATION / VALIDATION HELPERS
// ใช้ร่วมกันสำหรับ /announce และ /update (ป้องกัน Mention Spam, ความยาวเกิน,
// URL ไม่ถูกต้อง) — ไม่แตะฟังก์ชัน safeField เดิมที่ใช้กับระบบฝากบอก
// ======================================================

// ตัดข้อความยาวเกินอย่างปลอดภัย (ไม่ตัดกลาง surrogate pair ของ emoji)
function safeTruncate(text, maxLength) {
    const str = String(text ?? "");

    if (str.length <= maxLength) {
        return str;
    }

    return Array.from(str).slice(0, Math.max(0, maxLength - 3)).join("") + "...";
}

// ป้องกัน @everyone / @here / mass mention ที่ผู้ใช้พิมพ์เข้ามาใน Title/Description/รายการอัปเดต
// (การส่งจริงทุกจุดใน 2 ฟีเจอร์นี้ใช้ allowedMentions: { parse: [] } อยู่แล้วเป็นชั้นป้องกันที่ 2)
function sanitizeAnnounceText(text) {
    return String(text ?? "")
        .replace(/@everyone/gi, "@\u200beveryone")
        .replace(/@here/gi, "@\u200bhere")
        .trim();
}

function isValidHttpUrl(value) {
    if (!value) {
        return true; // field เป็น optional ปล่อยว่างได้
    }

    try {
        const url = new URL(value);

        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

const ANNOUNCE_TITLE_MAX = 256;
const ANNOUNCE_DESCRIPTION_MAX = 4096; // ขีดจำกัดจริงของ Embed Description (ใช้กับ safeTruncate/Embed เท่านั้น)
// Discord Modal Text Input (TextInputBuilder) จำกัด max_length ไว้ที่ 4000 เท่านั้น
// (ไม่ใช่ 4096 แบบ Embed Description) — ถ้าใช้ ANNOUNCE_DESCRIPTION_MAX (4096) กับ
// TextInputBuilder.setMaxLength() โดยตรง discord.js จะ throw ทันทีตอนสร้าง Modal
// (ก่อนถึง interaction.showModal() ด้วยซ้ำ) ทำให้ /announce ขึ้น "เกิดข้อผิดพลาด"
// นี่คือสาเหตุจริงของบัค /announce ที่รายงานมา — ต้องแยกค่านี้ออกจากกันให้ชัดเจน
const ANNOUNCE_MODAL_DESCRIPTION_MAX = 4000;
const ANNOUNCE_UPDATE_LIST_MAX = 900; // ต้องพอดีกับ Field Value (1024) รวมกับบรรทัดวันที่อัตโนมัติและ code fence
const ANNOUNCE_PINK = "#FF69B4";
const UPDATE_FIELD_NAME = "📢 อัปเดตล่าสุด";

// ======================================================
// 15G. COOLDOWNS
// Cooldown ต่อ User สำหรับคำสั่งที่มีผลกระทบวงกว้าง (/announce, /update)
// และ Lock กันกดซ้อนระหว่างที่ Queue กำลังทำงานอยู่ (ต่อ feature ไม่ใช่ต่อ user
// เพราะมีแค่ Bot Owner เท่านั้นที่ใช้ได้ และไม่ควรมี 2 งานพร้อมกันไม่ว่าใครจะกด)
// ======================================================

const commandCooldowns = new Map(); // key: `${userId}:${commandName}` -> timestamp ที่ใช้ได้อีกครั้ง

function checkCooldown(userId, commandName, cooldownMs) {
    const key = `${userId}:${commandName}`;
    const now = Date.now();
    const readyAt = commandCooldowns.get(key) || 0;

    if (now < readyAt) {
        return {
            onCooldown: true,
            remainingSeconds: Math.ceil((readyAt - now) / 1000)
        };
    }

    commandCooldowns.set(key, now + cooldownMs);

    return { onCooldown: false };
}

// Lock กันกด "ยืนยัน" ซ้อนกันหลายงานพร้อมกันสำหรับ /announce และ /update แยกกัน
const broadcastLocks = {
    announce: false,
    update: false
};

// ======================================================
// 15H. GENERIC DM / BROADCAST QUEUE
// ใช้ร่วมกันทั้งระบบประกาศ DM (/announce) และระบบแจ้งอัปเดต (/update)
// - จำกัด concurrency (ค่าเริ่มต้น 2 งานพร้อมกัน)
// - Delay ปรับได้ระหว่างงาน
// - ตรวจจับ HTTP 429 และใช้ retry_after จาก Discord
// - Exponential backoff สำหรับข้อผิดพลาดชั่วคราว
// - จำกัด retry ต่อ task (ค่าเริ่มต้น 2 ครั้ง)
// - Pause อัตโนมัติเมื่อโดน rate limit ต่อเนื่องหลายครั้งติดกัน
// - รองรับยกเลิกระหว่างทำงานผ่าน cancelToken
// - ไม่ retry error ถาวร (Missing Permissions / Unknown User / Unknown Channel / บล็อก DM)
// ======================================================

const PERMANENT_DISCORD_ERROR_CODES = new Set([
    10001, // Unknown Account
    10003, // Unknown Channel
    10004, // Unknown Guild
    10007, // Unknown Member
    10008, // Unknown Message (เช่น Panel ของ /setup ถูกลบไปแล้ว — ใช้กับ /update)
    10013, // Unknown User
    50001, // Missing Access
    50007, // Cannot send messages to this user (DM ปิด/บล็อกบอท)
    50013  // Missing Permissions
]);

function isPermanentDiscordError(error) {
    return PERMANENT_DISCORD_ERROR_CODES.has(error?.code);
}

function createCancelToken() {
    return { cancelled: false };
}

/**
 * runQueue: ประมวลผล tasks ทีละกลุ่มตาม concurrency ที่กำหนด
 * @param {Array} tasks - รายการ task แต่ละตัวมี { id, run: async () => any }
 * @param {Object} options
 * @returns {Promise<{success:number, failed:number, skipped:number, rateLimited:number, results:Array}>}
 */
async function runQueue(tasks, options = {}) {
    const {
        concurrency = 2,
        delayMs = 700,
        maxRetries = 2,
        cancelToken = createCancelToken(),
        onProgress = null
    } = options;

    const results = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let rateLimitedCount = 0;
    let consecutiveRateLimits = 0;
    let cursor = 0;

    async function processOne(task) {
        let attempt = 0;
        let lastError = null;

        while (attempt <= maxRetries) {
            if (cancelToken.cancelled) {
                skippedCount += 1;
                return { id: task.id, status: "skipped", reason: "cancelled" };
            }

            try {
                await task.run();

                consecutiveRateLimits = 0;

                successCount += 1;

                return { id: task.id, status: "success" };
            } catch (error) {
                lastError = error;

                // 429 Rate Limit — เคารพ retry_after ที่ Discord ส่งมาเสมอ ห้ามฝืนส่งซ้ำทันที
                const isRateLimit =
                    error?.status === 429 ||
                    error?.httpStatus === 429;

                if (isRateLimit) {
                    rateLimitedCount += 1;
                    consecutiveRateLimits += 1;

                    const retryAfterMs = Math.max(
                        250,
                        Math.round(
                            (error?.retry_after ??
                                error?.data?.retry_after ??
                                1) * 1000
                        )
                    );

                    // Pause งานทั้งคิวชั่วคราวถ้าโดน rate limit ติดกันหลายครั้ง —
                    // ป้องกันการฝืนยิง API ต่อเนื่องตอน Discord กำลังจำกัดเราอยู่จริงๆ
                    const pauseMs =
                        consecutiveRateLimits >= 3
                            ? retryAfterMs * 3
                            : retryAfterMs;

                    await new Promise(resolve =>
                        setTimeout(resolve, pauseMs)
                    );

                    attempt += 1;
                    continue;
                }

                if (isPermanentDiscordError(error)) {
                    // Error ถาวร (ปิด DM / บล็อกบอท / ไม่มีสิทธิ์ ฯลฯ) — ห้าม retry
                    failedCount += 1;

                    return {
                        id: task.id,
                        status: "failed",
                        permanent: true,
                        reason: sanitizeError(error)
                    };
                }

                // Error ชั่วคราวอื่นๆ — ใช้ exponential backoff แล้ว retry จนครบ maxRetries
                attempt += 1;

                if (attempt > maxRetries) {
                    break;
                }

                const backoffMs =
                    500 * Math.pow(2, attempt - 1);

                await new Promise(resolve =>
                    setTimeout(resolve, backoffMs)
                );
            }
        }

        failedCount += 1;

        return {
            id: task.id,
            status: "failed",
            reason: sanitizeError(lastError)
        };
    }

    async function worker() {
        while (cursor < tasks.length) {
            if (cancelToken.cancelled) {
                // ทำเครื่องหมายงานที่เหลือทั้งหมดว่าถูกข้าม (ยกเลิกระหว่างทำงาน)
                while (cursor < tasks.length) {
                    const skippedTask = tasks[cursor];
                    cursor += 1;
                    skippedCount += 1;
                    results.push({
                        id: skippedTask.id,
                        status: "skipped",
                        reason: "cancelled"
                    });
                }
                break;
            }

            const index = cursor;
            cursor += 1;

            const task = tasks[index];

            const result = await processOne(task);
            results.push(result);

            if (onProgress) {
                try {
                    onProgress({
                        done: results.length,
                        total: tasks.length,
                        success: successCount,
                        failed: failedCount,
                        skipped: skippedCount,
                        rateLimited: rateLimitedCount
                    });
                } catch {
                    // ไม่ให้ error จาก callback progress ทำให้ queue หยุดทำงาน
                }
            }

            if (!cancelToken.cancelled && delayMs > 0) {
                await new Promise(resolve =>
                    setTimeout(resolve, delayMs)
                );
            }
        }
    }

    const workerCount = Math.max(
        1,
        Math.min(concurrency, tasks.length || 1)
    );

    await Promise.all(
        Array.from({ length: workerCount }, () => worker())
    );

    return {
        success: successCount,
        failed: failedCount,
        skipped: skippedCount,
        rateLimited: rateLimitedCount,
        results
    };
}

// ======================================================
// 15I. ANNOUNCE AUDIENCE HELPERS
// คำนวณกลุ่มผู้รับตาม guild.members.cache (ต้องมี GuildMembers Intent)
// ป้องกันสมาชิกซ้ำข้ามเซิร์ฟเวอร์ด้วย Set ของ user.id และไม่ส่งหาบอท
// ======================================================

const ANNOUNCE_AUDIENCES = {
    all_members: "สมาชิกทุกคนในทุกเซิร์ฟเวอร์ที่บอทอยู่",
    administrators: "เฉพาะสมาชิกที่มีสิทธิ์ผู้ดูแล",
    manage_guild: "เฉพาะสมาชิกที่มีสิทธิ์จัดการเซิร์ฟเวอร์",
    guild_owners: "เฉพาะเจ้าของเซิร์ฟเวอร์"
};

// พยายาม fetch member list ของ guild แบบปลอดภัย — ถ้าพลาด (เช่น Intent ไม่เปิด,
// guild ใหญ่เกินไป, timeout) ให้คืน cache ที่มีอยู่แทนการทำให้ทั้งงานล้ม
async function safeFetchGuildMembers(guild) {
    try {
        return await guild.members.fetch();
    } catch (error) {
        logDetailedError(`Announce: fetch members (guild ${guild.id})`, error);

        return guild.members.cache;
    }
}

async function collectAnnounceRecipients(audience) {
    const recipients = new Map(); // userId -> { id, guildCount }
    let serverCount = 0;

    for (const guild of client.guilds.cache.values()) {
        serverCount += 1;

        if (audience === "guild_owners") {
            if (!guild.ownerId) {
                continue;
            }

            if (!recipients.has(guild.ownerId)) {
                recipients.set(guild.ownerId, { id: guild.ownerId });
            }

            continue;
        }

        const members = await safeFetchGuildMembers(guild);

        for (const member of members.values()) {
            if (member.user.bot) {
                continue;
            }

            if (
                audience === "administrators" &&
                !member.permissions.has(PermissionFlagsBits.Administrator)
            ) {
                continue;
            }

            if (
                audience === "manage_guild" &&
                !member.permissions.has(PermissionFlagsBits.ManageGuild)
            ) {
                continue;
            }

            if (!recipients.has(member.id)) {
                recipients.set(member.id, { id: member.id });
            }
        }
    }

    return {
        serverCount,
        recipients: Array.from(recipients.values())
    };
}

// ======================================================
// 15J. ANNOUNCE / UPDATE EMBED BUILDERS
// ======================================================

function buildAnnounceEmbed(draft) {
    const embed = new EmbedBuilder()
        .setColor(ANNOUNCE_PINK)
        .setTitle(safeTruncate(draft.title, ANNOUNCE_TITLE_MAX))
        .setDescription(
            safeTruncate(draft.description, ANNOUNCE_DESCRIPTION_MAX)
        )
        .setFooter({
            text: UI_CONFIG.embed.footer || "Developer : tin.py"
        })
        .setTimestamp();

    if (draft.image) {
        embed.setImage(draft.image);
    }

    return embed;
}

// วันที่/เวลาปัจจุบัน (Asia/Bangkok) รูปแบบไทยสำหรับแปะไว้ใน Field อัปเดตอัตโนมัติ
function formatThaiDateTime(date = new Date()) {
    return date.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

// สร้างเนื้อหาของ Field "📢 อัปเดตล่าสุด" — เฉพาะรายการอัปเดต + วันที่อัปเดตอัตโนมัติ
// เท่านั้น (ไม่มี Title/Description/Image แยก เพราะซ้ำซ้อนกับ Embed หลักของ /setup
// อยู่แล้ว) ใช้ safeField ตัดให้ไม่เกิน 1024 ตัวอักษร (ขีดจำกัดจริงของ Embed Field Value)
function buildUpdateFieldValue(draft) {
    const dateLine = `อัปเดตล่าสุด: ${formatThaiDateTime()}`;
    const listBlock = draft.updateList ? draft.updateList.trim() : "";

    // เผื่อพื้นที่ให้บรรทัดวันที่แสดงเสมอ (ไม่ถูกตัดหายไปตอนใกล้ขีดจำกัด 1024
    // ตัวอักษรของ Field Value) โดยตัดเฉพาะส่วนรายการอัปเดตถ้ายาวเกินพื้นที่ที่เหลือ
    const wrapperLength = "```\n\n```\n".length;
    const maxListLength = Math.max(
        0,
        1024 - wrapperLength - dateLine.length - 3
    );

    const truncatedList =
        listBlock.length > maxListLength
            ? listBlock.slice(0, maxListLength) + "..."
            : listBlock;

    return `\`\`\`\n${truncatedList}\n\`\`\`\n${dateLine}`;
}

// merge Field "📢 อัปเดตล่าสุด" เข้ากับ Embed หลักของ /setup ที่มีอยู่เดิม (baseEmbedData
// คือ embed data จากข้อความ Panel จริง หรือ null ถ้าไม่มี ให้ fallback เป็น buildMainEmbed())
// - แทนที่ Field เดิมชื่อเดียวกัน (ถ้ามี) ด้วยอันใหม่ทุกครั้ง (กรอบเดิม ไม่สะสม ไม่ซ้ำ)
// - เก็บ Field/เนื้อหาอื่นของ Panel เดิมไว้ทั้งหมด และให้ Field นี้อยู่ล่างสุดเสมอ
// - วันที่อัปเดตจะถูกคำนวณใหม่อัตโนมัติทุกครั้งที่เรียกฟังก์ชันนี้ (ดู buildUpdateFieldValue)
function buildUpdatedPanelEmbed(baseEmbedData, draft) {
    const embed = baseEmbedData
        ? EmbedBuilder.from(baseEmbedData)
        : buildMainEmbed();

    const existingFields = (embed.data.fields || []).filter(
        field => field.name !== UPDATE_FIELD_NAME
    );

    embed.setFields([
        ...existingFields,
        {
            name: UPDATE_FIELD_NAME,
            value: buildUpdateFieldValue(draft),
            inline: false
        }
    ]);

    return embed;
}

function buildAnnouncePreviewEmbed(draft, audienceInfo) {
    return new EmbedBuilder()
        .setColor(ANNOUNCE_PINK)
        .setTitle("ตรวจสอบก่อนส่งประกาศ")
        .addFields(
            {
                name: "กลุ่มผู้รับ",
                value: ANNOUNCE_AUDIENCES[draft.audience] || "ไม่ทราบ",
                inline: false
            },
            {
                name: "จำนวนเซิร์ฟเวอร์",
                value: String(audienceInfo.serverCount),
                inline: true
            },
            {
                name: "จำนวนผู้รับ",
                value: String(audienceInfo.recipients.length),
                inline: true
            },
            {
                name: "Title",
                value: safeField(draft.title),
                inline: false
            },
            {
                name: "Description",
                value: safeField(draft.description),
                inline: false
            },
            {
                name: "⚠️ คำเตือน",
                value:
                    "การส่ง DM อาจล้มเหลวหากผู้รับปิดกั้น DM จากสมาชิกที่ไม่รู้จัก หรือบล็อกบอทไว้ ระบบจะข้ามผู้ใช้เหล่านั้นโดยอัตโนมัติและไม่ retry ซ้ำ",
                inline: false
            }
        )
        .setFooter({ text: "LevelingX • Owner Only" });
}

function buildUpdatePreviewEmbed(draft, targetGuildCount) {
    return new EmbedBuilder()
        .setColor(ANNOUNCE_PINK)
        .setTitle("ตรวจสอบก่อนส่งแจ้งอัปเดต")
        .addFields(
            {
                name: "จำนวนเซิร์ฟเวอร์ที่ตั้งค่าระบบฝากบอกไว้",
                value: String(targetGuildCount),
                inline: true
            },
            {
                name: "รายการอัปเดต",
                value: safeField(draft.updateList || "(ไม่มี)"),
                inline: false
            }
        )
        .setFooter({ text: "LevelingX • Owner Only" });
}

function buildConfirmCancelEditRow(prefix, sessionId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}_confirm:${sessionId}`)
            .setLabel("ยืนยันประกาศ")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`${prefix}_edit:${sessionId}`)
            .setLabel("แก้ไข")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId(`${prefix}_cancel:${sessionId}`)
            .setLabel("ยกเลิก")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
    );
}

function buildCancelOnlyRow(prefix, sessionId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${prefix}_cancel_inflight:${sessionId}`)
            .setLabel("ยกเลิกการส่งที่กำลังทำงานอยู่")
            .setEmoji("🛑")
            .setStyle(ButtonStyle.Danger)
    );
}

// ======================================================
// 15K. DRAFT SESSION STORAGE (in-memory)
// เก็บ Draft ของ /announce, /update ระหว่างขั้นตอน Select → Modal → Preview → Confirm
// เฉพาะ Bot Owner เท่านั้นที่เข้าถึงได้ (ตรวจซ้ำทุกจุด) จึง key ด้วย sessionId สุ่มพอ
// เพื่อกันคนอื่นเดา customId มายุ่งกับ session ของ Owner ได้
// ======================================================

const announceSessions = new Map(); // sessionId -> { draft, cancelToken, createdAt }
const updateSessions = new Map();

function makeSessionId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// เก็บกวาด session ที่ค้างนานเกินไป (เผื่อ Owner ปิดหน้าต่างทิ้งไว้เฉยๆ) กัน memory leak
setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000; // 30 นาที

    for (const [id, session] of announceSessions.entries()) {
        if (session.createdAt < cutoff) {
            announceSessions.delete(id);
        }
    }

    for (const [id, session] of updateSessions.entries()) {
        if (session.createdAt < cutoff) {
            updateSessions.delete(id);
        }
    }
}, 5 * 60 * 1000);

// ======================================================
// 15L. AUTO SETUP (ใช้โดยปุ่ม "⚙️ ตั้งค่าระบบอัตโนมัติ" ตอน DM ต้อนรับ)
// สร้าง Category + Text Channel + Panel ให้อัตโนมัติถ้ายังไม่เคย Setup
// ป้องกันการกดซ้ำพร้อมกันด้วย Lock ต่อ Guild
// ======================================================

const guildAutoSetupLocks = new Set();

async function runAutoGuildSetup(guild) {
    if (guildAutoSetupLocks.has(guild.id)) {
        return {
            ok: false,
            reason: "กำลังตั้งค่าระบบ กรุณารอสักครู่ค่ะ"
        };
    }

    guildAutoSetupLocks.add(guild.id);

    try {
        const existingSetup = await getGuildSetup(guild.id);

        // ถ้าตั้งค่าไปแล้วและ channel/panel ยังใช้งานได้จริง ห้ามสร้างซ้ำ
        if (existingSetup?.targetChannelId) {
            const existingChannel = await client.channels
                .fetch(existingSetup.targetChannelId)
                .catch(() => null);

            if (existingChannel) {
                return {
                    ok: true,
                    alreadySetup: true,
                    channelId: existingChannel.id
                };
            }
            // ถ้า fetch ไม่เจอ (ถูกลบไปแล้ว) ให้ทำ setup ใหม่ต่อไปด้านล่างตามปกติ
        }

        const me = guild.members.me;

        if (
            !me ||
            !me.permissions.has(PermissionFlagsBits.ManageChannels)
        ) {
            return {
                ok: false,
                reason: "บอทไม่มีสิทธิ์ Manage Channels ในเซิร์ฟเวอร์นี้"
            };
        }

        let category = null;

        try {
            category = await guild.channels.create({
                name: "ระบบฝากบอก",
                type: ChannelType.GuildCategory
            });
        } catch (error) {
            console.error(
                "Auto setup: create category error:",
                sanitizeError(error)
            );

            return {
                ok: false,
                reason: "สร้างหมวดหมู่ไม่สำเร็จ (ตรวจสอบสิทธิ์บอท)"
            };
        }

        let channel = null;

        try {
            channel = await guild.channels.create({
                name: "ฝากบอก",
                type: ChannelType.GuildText,
                parent: category.id
            });
        } catch (error) {
            console.error(
                "Auto setup: create channel error:",
                sanitizeError(error)
            );

            return {
                ok: false,
                reason: "สร้างช่องข้อความไม่สำเร็จ (ตรวจสอบสิทธิ์บอท)"
            };
        }

        const embed = buildMainEmbed();
        const button = buildMainButton();

        let panelMessage = null;

        try {
            panelMessage = await channel.send({
                embeds: [embed],
                components: [button]
            });
        } catch (error) {
            console.error(
                "Auto setup: send panel error:",
                sanitizeError(error)
            );

            return {
                ok: false,
                reason: "สร้างช่องสำเร็จ แต่ส่ง Embed หลักไม่สำเร็จ"
            };
        }

        try {
            await guildSetups.updateOne(
                { guildId: guild.id },
                {
                    $set: {
                        guildId: guild.id,
                        panelChannelId: panelMessage.channelId,
                        panelMessageId: panelMessage.id,
                        targetChannelId: channel.id,
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );
        } catch (error) {
            console.error(
                "Auto setup: DB save error:",
                sanitizeError(error)
            );

            return {
                ok: false,
                reason:
                    "สร้างช่องและ Embed สำเร็จ แต่บันทึกข้อมูลลง MongoDB ไม่สำเร็จ"
            };
        }

        return {
            ok: true,
            alreadySetup: false,
            channelId: channel.id
        };
    } finally {
        guildAutoSetupLocks.delete(guild.id);
    }
}

// ======================================================
// 15M. WELCOME DM (guildCreate)
// ======================================================

function buildWelcomeEmbed(guild) {
    return new EmbedBuilder()
        .setColor(ANNOUNCE_PINK)
        .setTitle("ขอบคุณที่เพิ่มบอท yume")
        .setDescription(
            "ขอบคุณที่เพิ่มบอทเข้าสู่เซิร์ฟเวอร์ของคุณ ตอนนี้บอทพร้อมใช้งานแล้ว " +
                "กดปุ่มด้านล่างเพื่อเริ่มตั้งค่าระบบฝากบอกอัตโนมัติได้เลย"
        )
        .addFields(
            {
                name: "เซิร์ฟเวอร์",
                value: safeField(guild.name),
                inline: true
            },
            {
                name: "จำนวนสมาชิกโดยประมาณ",
                value: String(guild.memberCount || 0),
                inline: true
            }
        )
        .setFooter({ text: "Developer : tin.py" })
        .setTimestamp();
}

function buildWelcomeButtons(guild) {
    const inviteUrl =
        `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}` +
        `&permissions=${PermissionFlagsBits.Administrator}` +
        `&scope=bot%20applications.commands`;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`welcome_setup:${guild.id}`)
            .setLabel("ตั้งค่าระบบ")
            .setEmoji("⚙️")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("welcome_help")
            .setLabel("วิธีใช้งาน")
            .setEmoji("📖")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setLabel("เชิญบอท")
            .setEmoji("🔗")
            .setStyle(ButtonStyle.Link)
            .setURL(inviteUrl)
    );
}

// พยายามหาว่าใครเป็นคนเพิ่มบอทเข้ามาจาก Audit Log (ต้องมีสิทธิ์ View Audit Log)
// ถ้าหาไม่ได้อย่างน่าเชื่อถือ (ไม่มีสิทธิ์ / entry ไม่ตรง / อายุเกิน) ให้คืน null
// แล้วปล่อยให้ผู้เรียกใช้ fallback ไปหาเจ้าของเซิร์ฟเวอร์แทน — ห้ามเดาสุ่มเด็ดขาด
async function findGuildAdderUserId(guild) {
    try {
        const me = guild.members.me;

        if (
            !me ||
            !me.permissions.has(PermissionFlagsBits.ViewAuditLog)
        ) {
            return null;
        }

        const auditLogs = await guild.fetchAuditLogs({
            type: AuditLogEvent.BotAdd,
            limit: 5
        });

        const entry = auditLogs.entries.find(
            log => log.target?.id === client.user.id
        );

        if (!entry || !entry.executor) {
            return null;
        }

        // ตรวจว่า entry สดใหม่จริง (ภายใน 5 นาที) กันกรณีดึง log เก่าของการ add
        // บอทตัวเดียวกันในอดีตที่เคย kick ออกแล้วเชิญกลับมาใหม่แต่ log ไม่ update
        const isFresh =
            Date.now() - entry.createdTimestamp < 5 * 60 * 1000;

        if (!isFresh) {
            return null;
        }

        return entry.executor.id;
    } catch (error) {
        console.error(
            "⚠️ Audit log lookup error:",
            sanitizeError(error)
        );

        return null;
    }
}

async function sendWelcomeDm(guild) {
    try {
        let targetUserId = await findGuildAdderUserId(guild);

        if (!targetUserId) {
            targetUserId = guild.ownerId || null;
        }

        if (!targetUserId) {
            console.log(
                `ℹ️ guildCreate(${guild.id}): ไม่สามารถระบุผู้รับ DM ต้อนรับได้ ข้าม`
            );
            return;
        }

        const targetUser = await client.users
            .fetch(targetUserId)
            .catch(() => null);

        if (!targetUser || targetUser.bot) {
            return;
        }

        await targetUser.send({
            embeds: [buildWelcomeEmbed(guild)],
            components: [buildWelcomeButtons(guild)],
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        // DM ส่งไม่ได้ (ปิด DM / บล็อกบอท) เป็นเรื่องปกติมาก — log แบบปลอดภัยแล้วปล่อยผ่าน
        // ห้ามทำให้ guildCreate handler ทั้งตัวพังเพราะ DM ส่งไม่ได้
        console.log(
            `ℹ️ guildCreate(${guild.id}): ส่ง DM ต้อนรับไม่สำเร็จ:`,
            sanitizeError(error)
        );
    }
}

// ======================================================
// 16. STARTUP
// ======================================================

client.once(
    Events.ClientReady,
    async readyClient => {
        try {
            console.log(
                `🤖 Logged in as ${readyClient.user.tag}`
            );

            const inviteUrl =
                `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}` +
                `&permissions=${PermissionFlagsBits.Administrator}` +
                `&scope=bot%20applications.commands`;

            console.log(
                "ℹ️ ถ้า Slash Command ไม่ขึ้น ให้ตรวจว่าบอทถูก invite ด้วยลิงก์ที่มี scope 'bot' และ 'applications.commands' ทั้งคู่:"
            );
            console.log(
                `   ${inviteUrl}`
            );

            await registerCommands();

            // เริ่ม Presence rotation (ครอบคลุมทุก Guild ที่บอทอยู่)
            startPresenceRotation();

            // เริ่ม interval flush global stats เป็นระยะ (ไม่เขียนทุก interaction)
            startStatsFlushInterval();

            // Sync ข้อมูล Guild ลง MongoDB (bot_guilds) — ทำแบบไม่บล็อก ready event
            // เผื่อ MongoDB ยังเชื่อมต่อไม่เสร็จตอนนี้
            syncAllGuildStats().catch(error => {
                console.error(
                    "⚠️ Initial guild stats sync error:",
                    sanitizeError(error)
                );
            });

            // อัปเดต embed หน้าต่างฝากบอกของทุกเซิร์ฟเวอร์ที่เคย /setup ไว้แล้ว
            // ให้ตรงกับ UI_CONFIG ล่าสุดในโค้ดโดยอัตโนมัติ (เผื่อ MongoDB ยังไม่พร้อม
            // ตอนนี้ trySyncSetupPanelsOnce() จะถูกเรียกซ้ำอีกครั้งตอน MongoDB
            // เชื่อมต่อสำเร็จใน connectDatabase())
            trySyncSetupPanelsOnce();

            console.log(
                "🚀 Bot is fully ready and operational!"
            );
        } catch (error) {
            console.error(
                "❌ ClientReady error:",
                sanitizeError(error)
            );

            process.exit(1);
        }
    }
);

// ======================================================
// 16B. GUILD JOIN / LEAVE
// อัปเดต Presence + Guild Stats เมื่อบอทเข้า/ออกจากเซิร์ฟเวอร์
// ======================================================

client.on(Events.GuildCreate, async guild => {
    console.log(
        `➕ Joined guild: ${guild.name} (${guild.id})`
    );

    startPresenceRotation();

    await upsertGuildStats(guild).catch(error => {
        console.error(
            "⚠️ guildCreate stats error:",
            sanitizeError(error)
        );
    });

    // DM ต้อนรับ — best-effort เท่านั้น ห้ามให้ error จุดนี้กระทบส่วนอื่นของ guildCreate
    await sendWelcomeDm(guild).catch(error => {
        console.error(
            "⚠️ guildCreate welcome DM error:",
            sanitizeError(error)
        );
    });
});

client.on(Events.GuildDelete, async guild => {
    console.log(
        `➖ Left guild: ${guild.name} (${guild.id})`
    );

    startPresenceRotation();

    await removeGuildStats(guild.id).catch(error => {
        console.error(
            "⚠️ guildDelete stats error:",
            sanitizeError(error)
        );
    });
});

// ======================================================
// 17. INTERACTION HANDLER
// ======================================================

client.on(
    Events.InteractionCreate,
    async interaction => {
        try {

            if (interaction.isChatInputCommand()) {
                incrementCommandsUsed();
            }

            // ==================================================
            // /announce — OWNER ONLY (STEP 1: เลือกกลุ่มผู้รับ)
            // ==================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "announce"
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                if (broadcastLocks.announce) {
                    return interaction.reply({
                        content:
                            "มีการส่งประกาศกำลังทำงานอยู่แล้ว กรุณารอให้เสร็จก่อน",
                        ephemeral: true
                    });
                }

                const cooldown = checkCooldown(
                    interaction.user.id,
                    "announce",
                    30000
                );

                if (cooldown.onCooldown) {
                    return interaction.reply({
                        content: `กรุณารออีก ${cooldown.remainingSeconds} วินาทีก่อนใช้คำสั่งนี้อีกครั้ง`,
                        ephemeral: true
                    });
                }

                const audienceSelect = new StringSelectMenuBuilder()
                    .setCustomId("announce_audience_select")
                    .setPlaceholder("เลือกกลุ่มผู้รับประกาศ")
                    .addOptions(
                        Object.entries(ANNOUNCE_AUDIENCES).map(
                            ([value, label]) => ({
                                label: safeTruncate(label, 100),
                                value
                            })
                        )
                    );

                return interaction.reply({
                    content: "เลือกกลุ่มผู้รับที่ต้องการส่งประกาศ",
                    components: [
                        new ActionRowBuilder().addComponents(audienceSelect)
                    ],
                    ephemeral: true
                });
            }

            // ==================================================
            // SELECT: announce_audience_select (STEP 2: กรอก Embed)
            // ==================================================

            if (
                interaction.isStringSelectMenu() &&
                interaction.customId === "announce_audience_select"
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                const audience = interaction.values[0];

                if (!ANNOUNCE_AUDIENCES[audience]) {
                    return interaction.update({
                        content: "กลุ่มผู้รับไม่ถูกต้อง กรุณาลองใหม่ด้วย /announce",
                        components: []
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`announce_modal:${audience}`)
                    .setTitle("ระบบประกาศ DM");

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("title")
                            .setLabel("Title")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMaxLength(ANNOUNCE_TITLE_MAX)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("description")
                            .setLabel("Description")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(ANNOUNCE_MODAL_DESCRIPTION_MAX)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("image")
                            .setLabel("Image URL (ไม่ใส่ก็ได้)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                            .setMaxLength(500)
                    )
                );

                return interaction.showModal(modal);
            }

            // ==================================================
            // MODAL: announce_modal:<audience> (STEP 3: Preview)
            // ==================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith("announce_modal:")
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                const audience = interaction.customId.slice(
                    "announce_modal:".length
                );

                if (!ANNOUNCE_AUDIENCES[audience]) {
                    return interaction.reply({
                        content: "กลุ่มผู้รับไม่ถูกต้อง กรุณาลองใหม่ด้วย /announce",
                        ephemeral: true
                    });
                }

                const title = sanitizeAnnounceText(
                    interaction.fields.getTextInputValue("title")
                );

                const description = sanitizeAnnounceText(
                    interaction.fields.getTextInputValue("description")
                );

                const image = interaction.fields
                    .getTextInputValue("image")
                    .trim();

                if (!title || !description) {
                    return interaction.reply({
                        content: "กรุณากรอก Title และ Description",
                        ephemeral: true
                    });
                }

                if (!isValidHttpUrl(image)) {
                    return interaction.reply({
                        content: "Image URL ไม่ถูกต้อง กรุณาใส่ URL ที่ขึ้นต้นด้วย http:// หรือ https://",
                        ephemeral: true
                    });
                }

                await interaction.deferReply({ ephemeral: true });

                const draft = { audience, title, description, image };

                const audienceInfo = await collectAnnounceRecipients(audience);

                const sessionId = makeSessionId();

                announceSessions.set(sessionId, {
                    draft,
                    audienceInfo,
                    cancelToken: null,
                    createdAt: Date.now()
                });

                return interaction.editReply({
                    embeds: [
                        buildAnnouncePreviewEmbed(draft, audienceInfo),
                        buildAnnounceEmbed(draft)
                    ],
                    components: [
                        buildConfirmCancelEditRow("announce", sessionId)
                    ]
                });
            }

            // ==================================================
            // BUTTON: announce_edit:<sessionId>
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith("announce_edit:")
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                const sessionId = interaction.customId.slice(
                    "announce_edit:".length
                );

                const session = announceSessions.get(sessionId);

                if (!session) {
                    return interaction.update({
                        content: "Session หมดอายุแล้ว กรุณาเริ่มใหม่ด้วย /announce",
                        embeds: [],
                        components: []
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`announce_modal:${session.draft.audience}`)
                    .setTitle("ระบบประกาศ DM (แก้ไข)");

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("title")
                            .setLabel("Title")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMaxLength(ANNOUNCE_TITLE_MAX)
                            .setValue(session.draft.title)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("description")
                            .setLabel("Description")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(ANNOUNCE_MODAL_DESCRIPTION_MAX)
                            .setValue(session.draft.description)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("image")
                            .setLabel("Image URL (ไม่ใส่ก็ได้)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                            .setMaxLength(500)
                            .setValue(session.draft.image || "")
                    )
                );

                announceSessions.delete(sessionId);

                return interaction.showModal(modal);
            }

            // ==================================================
            // BUTTON: announce_cancel:<sessionId>
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith("announce_cancel:")
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                const sessionId = interaction.customId.slice(
                    "announce_cancel:".length
                );

                announceSessions.delete(sessionId);

                return interaction.update({
                    content: "ยกเลิกการประกาศแล้ว",
                    embeds: [],
                    components: []
                });
            }

            // ==================================================
            // BUTTON: announce_cancel_inflight:<sessionId> (ยกเลิกระหว่างส่ง)
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith("announce_cancel_inflight:")
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                const sessionId = interaction.customId.slice(
                    "announce_cancel_inflight:".length
                );

                const session = announceSessions.get(sessionId);

                if (session?.cancelToken) {
                    session.cancelToken.cancelled = true;
                }

                return interaction.update({
                    content: "กำลังยกเลิก... งานที่ค้างอยู่ในคิวจะถูกข้าม",
                    components: []
                });
            }

            // ==================================================
            // BUTTON: announce_confirm:<sessionId> (STEP 4: ส่งจริง)
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith("announce_confirm:")
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                if (broadcastLocks.announce) {
                    return interaction.reply({
                        content: "มีการส่งประกาศกำลังทำงานอยู่แล้ว",
                        ephemeral: true
                    });
                }

                const sessionId = interaction.customId.slice(
                    "announce_confirm:".length
                );

                const session = announceSessions.get(sessionId);

                if (!session) {
                    return interaction.update({
                        content: "Session หมดอายุแล้ว กรุณาเริ่มใหม่ด้วย /announce",
                        embeds: [],
                        components: []
                    });
                }

                broadcastLocks.announce = true;

                const cancelToken = createCancelToken();
                session.cancelToken = cancelToken;

                await interaction.update({
                    content: "กำลังส่งประกาศ... (อาจใช้เวลาสักครู่ตามจำนวนผู้รับ)",
                    embeds: [],
                    components: [
                        buildCancelOnlyRow("announce", sessionId)
                    ]
                });

                const startedAt = Date.now();
                const embed = buildAnnounceEmbed(session.draft);

                const tasks = session.audienceInfo.recipients.map(
                    recipient => ({
                        id: recipient.id,
                        run: async () => {
                            const user = await client.users.fetch(
                                recipient.id
                            );

                            if (user.bot) {
                                throw Object.assign(
                                    new Error("Skip bot"),
                                    { code: 50007 }
                                );
                            }

                            await user.send({
                                embeds: [embed],
                                allowedMentions: { parse: [] }
                            });
                        }
                    })
                );

                let queueResult;

                try {
                    queueResult = await runQueue(tasks, {
                        concurrency: 2,
                        delayMs: 700,
                        maxRetries: 2,
                        cancelToken
                    });
                } finally {
                    broadcastLocks.announce = false;
                    announceSessions.delete(sessionId);
                }

                const durationSeconds = (
                    (Date.now() - startedAt) / 1000
                ).toFixed(1);

                const reportEmbed = new EmbedBuilder()
                    .setColor(ANNOUNCE_PINK)
                    .setTitle("📊 รายงานผลการส่งประกาศ")
                    .addFields(
                        {
                            name: "✅ สำเร็จ",
                            value: String(queueResult.success),
                            inline: true
                        },
                        {
                            name: "❌ ล้มเหลว",
                            value: String(queueResult.failed),
                            inline: true
                        },
                        {
                            name: "⏭️ ข้าม",
                            value: String(queueResult.skipped),
                            inline: true
                        },
                        {
                            name: "🚦 ถูกจำกัด Rate Limit (ระหว่างทาง)",
                            value: String(queueResult.rateLimited),
                            inline: true
                        },
                        {
                            name: "⏱️ ระยะเวลาที่ใช้",
                            value: `${durationSeconds} วินาที`,
                            inline: true
                        },
                        {
                            name: "สถานะ",
                            value: cancelToken.cancelled
                                ? "ถูกยกเลิกระหว่างทำงาน"
                                : "เสร็จสิ้น",
                            inline: true
                        }
                    )
                    .setFooter({ text: "LevelingX • Owner Only" })
                    .setTimestamp();

                return interaction.editReply({
                    content: null,
                    embeds: [reportEmbed],
                    components: []
                }).catch(error => {
                    // Interaction token อาจหมดอายุถ้าใช้เวลาส่งนานเกิน ~15 นาที
                    // (จำนวนผู้รับเยอะมาก) — log ผลลัพธ์ไว้แทนเพื่อไม่ให้ผลลัพธ์หายไปเฉยๆ
                    console.log(
                        "ℹ️ Announce report (interaction token อาจหมดอายุแล้ว):",
                        JSON.stringify({
                            success: queueResult.success,
                            failed: queueResult.failed,
                            skipped: queueResult.skipped,
                            rateLimited: queueResult.rateLimited,
                            durationSeconds
                        })
                    );
                    logDetailedError("Announce: final report edit", error);
                });
            }

            // ==================================================
            // /update — OWNER ONLY (STEP 1: กรอก Embed)
            // ==================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "update"
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                if (broadcastLocks.update) {
                    return interaction.reply({
                        content:
                            "มีการส่งแจ้งอัปเดตกำลังทำงานอยู่แล้ว กรุณารอให้เสร็จก่อน",
                        ephemeral: true
                    });
                }

                const cooldown = checkCooldown(
                    interaction.user.id,
                    "update",
                    30000
                );

                if (cooldown.onCooldown) {
                    return interaction.reply({
                        content: `กรุณารออีก ${cooldown.remainingSeconds} วินาทีก่อนใช้คำสั่งนี้อีกครั้ง`,
                        ephemeral: true
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId("update_modal")
                    .setTitle("แจ้งอัปเดตบอท");

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("updateList")
                            .setLabel("รายการอัปเดต (บรรทัดละ 1 รายการ)")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(ANNOUNCE_UPDATE_LIST_MAX)
                            .setPlaceholder(
                                "[ + ] เพิ่มฟีเจอร์ใหม่\n[ ~ ] ปรับปรุงระบบเดิม\n[ - ] แก้ไขบั๊ก"
                            )
                    )
                );

                return interaction.showModal(modal);
            }

            // ==================================================
            // MODAL: update_modal (STEP 2: Preview)
            // ==================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId === "update_modal"
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                const updateList = sanitizeAnnounceText(
                    interaction.fields.getTextInputValue("updateList")
                );

                if (!updateList) {
                    return interaction.reply({
                        content: "กรุณากรอกรายการอัปเดต",
                        ephemeral: true
                    });
                }

                await interaction.deferReply({ ephemeral: true });

                const draft = { updateList };

                let targetGuildCount = 0;

                try {
                    targetGuildCount = await guildSetups.countDocuments({
                        panelChannelId: { $exists: true, $ne: null },
                        panelMessageId: { $exists: true, $ne: null }
                    });
                } catch (error) {
                    logDetailedError("Update: count target guilds", error);
                }

                const sessionId = makeSessionId();

                updateSessions.set(sessionId, {
                    draft,
                    cancelToken: null,
                    createdAt: Date.now()
                });

                return interaction.editReply({
                    embeds: [
                        buildUpdatePreviewEmbed(draft, targetGuildCount),
                        buildUpdatedPanelEmbed(null, draft)
                    ],
                    components: [
                        buildConfirmCancelEditRow("update", sessionId)
                    ]
                });
            }

            // ==================================================
            // BUTTON: update_edit:<sessionId>
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith("update_edit:")
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                const sessionId = interaction.customId.slice(
                    "update_edit:".length
                );

                const session = updateSessions.get(sessionId);

                if (!session) {
                    return interaction.update({
                        content: "Session หมดอายุแล้ว กรุณาเริ่มใหม่ด้วย /update",
                        embeds: [],
                        components: []
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId("update_modal")
                    .setTitle("แจ้งอัปเดตบอท");

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId("updateList")
                            .setLabel("รายการอัปเดต (บรรทัดละ 1 รายการ)")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(ANNOUNCE_UPDATE_LIST_MAX)
                            .setValue(session.draft.updateList)
                    )
                );

                updateSessions.delete(sessionId);

                return interaction.showModal(modal);
            }

            // ==================================================
            // BUTTON: update_cancel:<sessionId>
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith("update_cancel:")
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                const sessionId = interaction.customId.slice(
                    "update_cancel:".length
                );

                updateSessions.delete(sessionId);

                return interaction.update({
                    content: "ยกเลิกการแจ้งอัปเดตแล้ว",
                    embeds: [],
                    components: []
                });
            }

            // ==================================================
            // BUTTON: update_cancel_inflight:<sessionId>
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith("update_cancel_inflight:")
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                const sessionId = interaction.customId.slice(
                    "update_cancel_inflight:".length
                );

                const session = updateSessions.get(sessionId);

                if (session?.cancelToken) {
                    session.cancelToken.cancelled = true;
                }

                return interaction.update({
                    content: "กำลังยกเลิก... เซิร์ฟเวอร์ที่ยังไม่ถูกส่งจะถูกข้าม",
                    components: []
                });
            }

            // ==================================================
            // BUTTON: update_confirm:<sessionId> (STEP 3: ส่งจริง)
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith("update_confirm:")
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                if (broadcastLocks.update) {
                    return interaction.reply({
                        content: "มีการส่งแจ้งอัปเดตกำลังทำงานอยู่แล้ว",
                        ephemeral: true
                    });
                }

                const sessionId = interaction.customId.slice(
                    "update_confirm:".length
                );

                const session = updateSessions.get(sessionId);

                if (!session) {
                    return interaction.update({
                        content: "Session หมดอายุแล้ว กรุณาเริ่มใหม่ด้วย /update",
                        embeds: [],
                        components: []
                    });
                }

                broadcastLocks.update = true;

                const cancelToken = createCancelToken();
                session.cancelToken = cancelToken;

                await interaction.update({
                    content: "กำลังส่งแจ้งอัปเดตไปยังเซิร์ฟเวอร์ที่ตั้งค่าไว้...",
                    embeds: [],
                    components: [
                        buildCancelOnlyRow("update", sessionId)
                    ]
                });

                const startedAt = Date.now();

                // /update ต้องแก้ไข Embed หลักของ /setup (panelChannelId +
                // panelMessageId) ในข้อความเดิมเท่านั้น — ห้ามส่ง Embed ใหม่แยก,
                // ห้ามส่ง DM, ห้ามสร้างข้อความใหม่ทุกครั้งที่อัปเดต
                let targetGuilds = [];

                try {
                    targetGuilds = await guildSetups
                        .find({
                            panelChannelId: { $exists: true, $ne: null },
                            panelMessageId: { $exists: true, $ne: null }
                        })
                        .toArray();
                } catch (error) {
                    logDetailedError("Update: fetch target guilds", error);
                }

                const tasks = targetGuilds.map(setup => ({
                    id: setup.guildId,
                    run: async () => {
                        const channel = await client.channels.fetch(
                            setup.panelChannelId
                        );

                        const permissionCheck =
                            checkBotChannelPermissions(channel);

                        if (!permissionCheck.ok) {
                            throw Object.assign(
                                new Error(permissionCheck.reason),
                                { code: 50001 }
                            );
                        }

                        const panelMessage = await channel.messages.fetch(
                            setup.panelMessageId
                        );

                        // merge Field "📢 อัปเดตล่าสุด" เข้ากับ Embed หลักของ Panel เดิม
                        // (แทนที่ Field เดิมถ้ามี ไม่สะสม ไม่ลบเนื้อหาอื่นของ /setup)
                        const mergedEmbed = buildUpdatedPanelEmbed(
                            panelMessage.embeds[0] || null,
                            session.draft
                        );

                        // แก้ไขข้อความเดิมด้วย message.edit() เท่านั้น และคงปุ่ม
                        // Components เดิมของ Panel ไว้ทั้งหมด
                        await panelMessage.edit({
                            embeds: [mergedEmbed],
                            components: panelMessage.components
                        });
                    }
                }));

                let queueResult;

                try {
                    queueResult = await runQueue(tasks, {
                        concurrency: 2,
                        delayMs: 700,
                        maxRetries: 2,
                        cancelToken
                    });
                } finally {
                    broadcastLocks.update = false;
                    updateSessions.delete(sessionId);
                }

                const durationSeconds = (
                    (Date.now() - startedAt) / 1000
                ).toFixed(1);

                const reportEmbed = new EmbedBuilder()
                    .setColor(ANNOUNCE_PINK)
                    .setTitle("📊 รายงานผลการแจ้งอัปเดต")
                    .addFields(
                        {
                            name: "✅ สำเร็จ",
                            value: String(queueResult.success),
                            inline: true
                        },
                        {
                            name: "❌ ล้มเหลว",
                            value: String(queueResult.failed),
                            inline: true
                        },
                        {
                            name: "⏭️ ข้าม",
                            value: String(queueResult.skipped),
                            inline: true
                        },
                        {
                            name: "⏱️ ระยะเวลาที่ใช้",
                            value: `${durationSeconds} วินาที`,
                            inline: true
                        },
                        {
                            name: "สถานะ",
                            value: cancelToken.cancelled
                                ? "ถูกยกเลิกระหว่างทำงาน"
                                : "เสร็จสิ้น",
                            inline: true
                        }
                    )
                    .setFooter({ text: "LevelingX • Owner Only" })
                    .setTimestamp();

                return interaction.editReply({
                    content: null,
                    embeds: [reportEmbed],
                    components: []
                }).catch(error => {
                    console.log(
                        "ℹ️ Update report (interaction token อาจหมดอายุแล้ว):",
                        JSON.stringify({
                            success: queueResult.success,
                            failed: queueResult.failed,
                            skipped: queueResult.skipped,
                            durationSeconds
                        })
                    );
                    logDetailedError("Update: final report edit", error);
                });
            }

            // ==================================================
            // BUTTON: welcome_setup:<guildId> (จากปุ่มใน DM ต้อนรับ)
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith("welcome_setup:")
            ) {
                const guildId = interaction.customId.slice(
                    "welcome_setup:".length
                );

                await interaction.deferReply({ ephemeral: true });

                const guild = client.guilds.cache.get(guildId);

                if (!guild) {
                    return interaction.editReply({
                        content:
                            "ไม่พบเซิร์ฟเวอร์นี้ (บอทอาจถูกเชิญออกไปแล้ว)"
                    });
                }

                const member = await guild.members
                    .fetch(interaction.user.id)
                    .catch(() => null);

                const isOwnerOfGuild = guild.ownerId === interaction.user.id;

                const hasAdmin =
                    member?.permissions.has(
                        PermissionFlagsBits.Administrator
                    ) || isOwnerOfGuild;

                if (!hasAdmin) {
                    return interaction.editReply({
                        content:
                            "คุณต้องเป็นเจ้าของเซิร์ฟเวอร์หรือมีสิทธิ์ Administrator ในเซิร์ฟเวอร์นั้นถึงจะตั้งค่าได้"
                    });
                }

                const result = await runAutoGuildSetup(guild);

                if (!result.ok) {
                    return interaction.editReply({
                        content: `ตั้งค่าไม่สำเร็จ: ${result.reason}`
                    });
                }

                if (result.alreadySetup) {
                    return interaction.editReply({
                        content: `ระบบฝากบอกถูกตั้งค่าไว้แล้วที่ <#${result.channelId}>`
                    });
                }

                return interaction.editReply({
                    content: `ตั้งค่าระบบฝากบอกสำเร็จ! สร้างช่อง <#${result.channelId}> เรียบร้อยแล้ว`
                });
            }

            // ==================================================
            // BUTTON: welcome_help (จากปุ่มใน DM ต้อนรับ)
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId === "welcome_help"
            ) {
                const helpEmbed = new EmbedBuilder()
                    .setColor(UI_CONFIG.embed.color)
                    .setTitle("วิธีใช้งานบอท")
                    .setDescription(
                        "คำสั่งที่ใช้งานได้สำหรับผู้ดูแลเซิร์ฟเวอร์:"
                    )
                    .addFields(
                        {
                            name: "/setup",
                            value: "สร้าง หรืออัปเดตหน้าต่างฝากบอกในช่องปัจจุบัน",
                            inline: false
                        },
                        {
                            name: "/setchannel",
                            value: "กำหนดช่องที่จะใช้รับข้อความฝากบอกที่ถูกส่งเข้ามา",
                            inline: false
                        }
                    )
                    .setFooter({ text: UI_CONFIG.embed.footer });

                return interaction.reply({
                    embeds: [helpEmbed],
                    ephemeral: true
                });
            }

            // ==================================================
            // /owner-1 — OWNER ONLY
            // ==================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "owner-1"
            ) {
                // ตรวจสอบ Owner ก่อนทำอะไรทั้งสิ้น ห้าม query ข้อมูลใดๆ ก่อนผ่านจุดนี้
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                await interaction.deferReply({
                    ephemeral: true
                });

                const totalServers =
                    client.guilds.cache.size;

                // ผลรวมสมาชิกของ "ทุก" เซิร์ฟเวอร์ที่บอทอยู่ — ไม่ใช่ Unique Members
                // (คนเดียวกันอาจอยู่หลายเซิร์ฟเวอร์ได้ จึงนับซ้ำได้)
                const totalMembersSum =
                    getTotalMemberCount();

                const commandsUsedTotal =
                    await getCommandsUsedTotal();

                const memoryUsageMb = (
                    process.memoryUsage().rss /
                    1024 /
                    1024
                ).toFixed(1);

                const uptimeSeconds = Math.floor(
                    process.uptime()
                );

                const statsEmbed = new EmbedBuilder()
                    .setColor("#5865F2")
                    .setTitle("📊 Bot Statistics")
                    .addFields(
                        {
                            name: "🏠 Total Servers",
                            value: totalServers.toLocaleString(),
                            inline: true
                        },
                        {
                            name: "👥 Total Members (sum across servers)",
                            value: totalMembersSum.toLocaleString(),
                            inline: true
                        },
                        {
                            name: "⚡ Bot Status",
                            value: "Online",
                            inline: true
                        },
                        {
                            name: "⏱️ Uptime",
                            value: formatUptime(uptimeSeconds),
                            inline: true
                        },
                        {
                            name: "🤖 Discord Connection",
                            value: client.isReady()
                                ? "Connected"
                                : "Disconnected",
                            inline: true
                        },
                        {
                            name: "🗄️ MongoDB Status",
                            value: isMongoConnected()
                                ? "Connected"
                                : "Disconnected",
                            inline: true
                        },
                        {
                            name: "📊 Commands Used",
                            value: commandsUsedTotal.toLocaleString(),
                            inline: true
                        },
                        {
                            name: "💾 Memory Usage",
                            value: `${memoryUsageMb} MB`,
                            inline: true
                        },
                        {
                            name: "🕐 Last Updated",
                            value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                            inline: true
                        }
                    )
                    .setFooter({ text: "LevelingX" })
                    .setTimestamp();

                return interaction.editReply({
                    embeds: [statsEmbed]
                });
            }

            // ==================================================
            // /owner-3 — OWNER ONLY
            // ==================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "owner-3"
            ) {
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                await interaction.deferReply({
                    ephemeral: true
                });

                const totalServers =
                    client.guilds.cache.size;

                const totalMembersSum =
                    getTotalMemberCount();

                const commandsUsedTotal =
                    await getCommandsUsedTotal();

                const memoryUsageMb = (
                    process.memoryUsage().rss /
                    1024 /
                    1024
                ).toFixed(1);

                const uptimeSeconds = Math.floor(
                    process.uptime()
                );

                // ไม่เปิดเผย Token / Mongo URI / Environment Variables / Password / Secrets ใดๆ
                const botStatsEmbed = new EmbedBuilder()
                    .setColor("#57F287")
                    .setTitle("🤖 Bot Deep Stats (Owner Only)")
                    .addFields(
                        {
                            name: "Servers",
                            value: totalServers.toLocaleString(),
                            inline: true
                        },
                        {
                            name: "Total Members",
                            value: totalMembersSum.toLocaleString(),
                            inline: true
                        },
                        {
                            name: "Uptime",
                            value: formatUptime(uptimeSeconds),
                            inline: true
                        },
                        {
                            name: "Discord Status",
                            value: client.isReady()
                                ? "Connected"
                                : "Disconnected",
                            inline: true
                        },
                        {
                            name: "MongoDB Status",
                            value: isMongoConnected()
                                ? "Connected"
                                : "Disconnected",
                            inline: true
                        },
                        {
                            name: "Commands Used",
                            value: commandsUsedTotal.toLocaleString(),
                            inline: true
                        },
                        {
                            name: "Memory",
                            value: `${memoryUsageMb} MB`,
                            inline: true
                        },
                        {
                            name: "Node.js Version",
                            value: process.version,
                            inline: true
                        },
                        {
                            name: "Discord.js Version",
                            value:
                                require("discord.js").version ||
                                "unknown",
                            inline: true
                        },
                        {
                            name: "Bot Ping",
                            value: `${Math.round(client.ws.ping)}ms`,
                            inline: true
                        }
                    )
                    .setFooter({ text: "LevelingX Bot" })
                    .setTimestamp();

                return interaction.editReply({
                    embeds: [botStatsEmbed]
                });
            }

            // ==================================================
            // /owner-2 — OWNER ONLY (with pagination)
            // ==================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "owner-2"
            ) {
                // ตรวจสอบ Owner ก่อน — ห้าม query/ส่ง Server List ก่อนผ่านจุดนี้
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                await interaction.deferReply({
                    ephemeral: true
                });

                const { embed, components } =
                    await buildServersPage(0);

                return interaction.editReply({
                    embeds: [embed],
                    components
                });
            }

            // ==================================================
            // BUTTON: servers pagination (servers_page:<page>)
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    "servers_page:"
                )
            ) {
                // สำคัญ: ห้ามเชื่อว่าคนกดปุ่มคือคนเดียวกับที่เรียก /servers
                // ต้องตรวจ BOT_OWNER_ID ใหม่ทุกครั้งที่มีการกดปุ่ม
                if (await rejectIfNotOwner(interaction)) {
                    return;
                }

                const targetPage = parseInt(
                    interaction.customId.slice(
                        "servers_page:".length
                    ),
                    10
                );

                await interaction.deferUpdate();

                const { embed, components } =
                    await buildServersPage(
                        Number.isFinite(targetPage)
                            ? targetPage
                            : 0
                    );

                return interaction.editReply({
                    embeds: [embed],
                    components
                });
            }

            // ==================================================
            // /help — อธิบายเฉพาะ /setup และ /setchannel
            // ==================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "help"
            ) {
                const helpEmbed = new EmbedBuilder()
                    .setColor(UI_CONFIG.embed.color)
                    .setTitle("วิธีใช้งานบอท")
                    .setDescription(
                        "คำสั่งที่ใช้งานได้สำหรับผู้ที่ใช้งานบอทนี้:"
                    )
                    .addFields(
                        {
                            name: "/setup",
                            value: "สร้าง หรืออัปเดตหน้าต่างฝากบอกในช่องปัจจุบัน",
                            inline: false
                        },
                        {
                            name: "/setchannel",
                            value: "กำหนดช่องที่จะใช้รับข้อความฝากบอกที่ถูกส่งเข้ามา",
                            inline: false
                        }
                    )
                    .setFooter({
                        text: UI_CONFIG.embed.footer
                    });

                return interaction.reply({
                    embeds: [helpEmbed],
                    ephemeral: true
                });
            }

            // ==================================================
            // /setup
            // ==================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "setup"
            ) {
                if (!interaction.guild) {
                    return interaction.reply({
                        content:
                            "คำสั่งนี้ใช้ได้เฉพาะในเซิฟเท่านั้น",
                        ephemeral: true
                    });
                }

                if (
                    !interaction.memberPermissions?.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {
                    return interaction.reply({
                        content:
                            "คำสั่งนี้ใช้ได้เฉพาะหัวดิส",
                        ephemeral: true
                    });
                }

                await interaction.deferReply({
                    ephemeral: true
                });

                const permissionCheck =
                    checkBotChannelPermissions(
                        interaction.channel
                    );

                if (!permissionCheck.ok) {
                    return interaction.editReply({
                        content:
                            `ไม่สามารถสร้างหน้าต่างในช่องนี้ได้\nเหตุผล: ${permissionCheck.reason}`
                    });
                }

                const embed =
                    buildMainEmbed();

                const button =
                    buildMainButton();

                let panelMessage = null;

                // พยายามใช้ Panel เดิมก่อน
                const existingSetup =
                    await getGuildSetup(
                        interaction.guildId
                    );

                if (
                    existingSetup?.panelChannelId &&
                    existingSetup?.panelMessageId
                ) {
                    try {
                        const oldChannel =
                            await client.channels.fetch(
                                existingSetup.panelChannelId
                            );

                        if (
                            oldChannel &&
                            oldChannel.isTextBased()
                        ) {
                            const oldMessage =
                                await oldChannel.messages.fetch(
                                    existingSetup.panelMessageId
                                );

                            await oldMessage.edit({
                                embeds: [embed],
                                components: [button]
                            });

                            panelMessage =
                                oldMessage;

                            console.log(
                                "✅ Updated existing panel"
                            );
                        }
                    } catch (error) {
                        console.log(
                            "⚠️ Existing panel unavailable, creating new panel..."
                        );
                    }
                }

                // ถ้าไม่มี Panel เดิม ให้สร้างใหม่
                if (!panelMessage) {
                    try {
                        panelMessage =
                            await interaction.channel.send({
                                embeds: [embed],
                                components: [button]
                            });
                    } catch (error) {
                        console.error(
                            "Setup send error:",
                            sanitizeError(error)
                        );

                        return interaction.editReply({
                            content:
                                "ไม่สามารถส่ง Embed ลงในช่องนี้ได้"
                        });
                    }
                }

                // บันทึก Panel
                try {
                    await guildSetups.updateOne(
                        {
                            guildId:
                                interaction.guildId
                        },
                        {
                            $set: {
                                guildId:
                                    interaction.guildId,

                                panelChannelId:
                                    panelMessage.channelId,

                                panelMessageId:
                                    panelMessage.id,

                                updatedAt:
                                    new Date()
                            }
                        },
                        {
                            upsert: true
                        }
                    );
                } catch (error) {
                    console.error(
                        "Setup DB error:",
                        sanitizeError(error)
                    );

                    return interaction.editReply({
                        content:
                            "สร้างหน้าต่างแล้ว แต่ไม่สามารถบันทึกข้อมูลลง MongoDB ได้"
                    });
                }

                return interaction.editReply({
                    content:
                        "ตั้งค่า/อัปเดตหน้าต่างฝากบอกเรียบร้อยแล้ว"
                });
            }

            // ==================================================
            // /setchannel
            // ==================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "setchannel"
            ) {
                if (!interaction.guild) {
                    return interaction.reply({
                        content:
                            "คำสั่งนี้ใช้ได้เฉพาะในเซิฟเท่านั้น",
                        ephemeral: true
                    });
                }

                if (
                    !interaction.memberPermissions?.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {
                    return interaction.reply({
                        content:
                            "คำสั่งนี้ใช้ได้เฉพาะหัวดิส",
                        ephemeral: true
                    });
                }

                const channel =
                    interaction.options.getChannel(
                        "channel"
                    );

                if (!channel) {
                    return interaction.reply({
                        content:
                            "ไม่พบช่องที่เลือก",
                        ephemeral: true
                    });
                }

                const permissionCheck =
                    checkBotChannelPermissions(
                        channel
                    );

                if (!permissionCheck.ok) {
                    return interaction.reply({
                        content:
                            `ไม่สามารถใช้ช่องนี้ได้\nเหตุผล: ${permissionCheck.reason}`,
                        ephemeral: true
                    });
                }

                await interaction.deferReply({
                    ephemeral: true
                });

                try {
                    await guildSetups.updateOne(
                        {
                            guildId:
                                interaction.guildId
                        },
                        {
                            $set: {
                                guildId:
                                    interaction.guildId,

                                targetChannelId:
                                    channel.id,

                                updatedAt:
                                    new Date()
                            }
                        },
                        {
                            upsert: true
                        }
                    );
                } catch (error) {
                    console.error(
                        "SetChannel DB error:",
                        sanitizeError(error)
                    );

                    return interaction.editReply({
                        content:
                            "ไม่สามารถบันทึกช่องลงฐานข้อมูลได้"
                    });
                }

                return interaction.editReply({
                    content:
                        `ตั้งค่าช่องรับข้อความฝากบอกเป็น <#${channel.id}> เรียบร้อยแล้ว`
                });
            }

            // ==================================================
            // BUTTON: anonymous_send
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId ===
                    "anonymous_send"
            ) {
                if (!interaction.guildId) {
                    return interaction.reply({
                        content:
                            "ปุ่มนี้สามารถใช้ได้เฉพาะใน Server",
                        ephemeral: true
                    });
                }

                const setup =
                    await getGuildSetup(
                        interaction.guildId
                    );

                if (
                    !setup?.targetChannelId
                ) {
                    return interaction.reply({
                        content:
                            "ระบบฝากบอกยังไม่ได้ตั้งค่าช่องปลายทาง\nกรุณาให้หัวดิสใช้ `/setchannel` ก่อน",
                        ephemeral: true
                    });
                }

                const targetChannel =
                    await client.channels.fetch(
                        setup.targetChannelId
                    ).catch(() => null);

                const permissionCheck =
                    checkBotChannelPermissions(
                        targetChannel
                    );

                if (!permissionCheck.ok) {
                    return interaction.reply({
                        content:
                            `ช่องรับข้อความฝากบอกใช้งานไม่ได้\nเหตุผล: ${permissionCheck.reason}`,
                        ephemeral: true
                    });
                }

                const userSelect =
                    new UserSelectMenuBuilder()
                        .setCustomId(
                            "select_recipient"
                        )
                        .setPlaceholder(
                            "เลือกคนที่คุณต้องการฝากบอก"
                        )
                        .setMinValues(1)
                        .setMaxValues(1);

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            userSelect
                        );

                return interaction.reply({
                    content:
                        "🌎 เลือกคนที่คุณต้องการฝากบอก",
                    components: [row],
                    ephemeral: true
                });
            }

            // ==================================================
            // USER SELECT: recipient
            // ==================================================

            if (
                interaction.isUserSelectMenu() &&
                interaction.customId ===
                    "select_recipient"
            ) {
                const targetUserId =
                    interaction.values[0];

                if (
                    targetUserId ===
                    interaction.user.id
                ) {
                    return interaction.update({
                        content:
                            "ไม่สามารถฝากข้อความให้ตัวเองได้",
                        components: []
                    });
                }

                const targetUser =
                    await client.users.fetch(
                        targetUserId
                    ).catch(() => null);

                if (!targetUser) {
                    return interaction.update({
                        content:
                            "ไม่พบผู้ใช้ดังกล่าวในระบบ",
                        components: []
                    });
                }

                if (targetUser.bot) {
                    return interaction.update({
                        content:
                            "ไม่สามารถฝากข้อความถึงบอทได้",
                        components: []
                    });
                }

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            `message_modal:${targetUserId}`
                        )
                        .setTitle(
                            "ฝากข้อความ"
                        );

                const messageInput =
                    new TextInputBuilder()
                        .setCustomId(
                            "message"
                        )
                        .setLabel(
                            "ข้อความ (สูงสุด 1024 ตัวอักษร)"
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(true)
                        .setMaxLength(1024);

                const clueInput =
                    new TextInputBuilder()
                        .setCustomId(
                            "clue"
                        )
                        .setLabel(
                            "คำใบ้ (ถ้าไม่มีให้ปล่อยว่าง)"
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(false)
                        .setMaxLength(200);

                modal.addComponents(
                    new ActionRowBuilder()
                        .addComponents(
                            messageInput
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            clueInput
                        )
                );

                return interaction.showModal(
                    modal
                );
            }

            // ==================================================
            // MODAL: message_modal
            // ==================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith(
                    "message_modal:"
                )
            ) {
                const targetUserId =
                    interaction.customId.slice(
                        "message_modal:".length
                    );

                const message =
                    interaction.fields
                        .getTextInputValue(
                            "message"
                        )
                        .trim();

                const clue =
                    interaction.fields
                        .getTextInputValue(
                            "clue"
                        )
                        .trim();

                if (!/^\d{17,20}$/.test(targetUserId)) {
                    return interaction.reply({
                        content:
                            "ข้อมูลผู้รับไม่ถูกต้อง",
                        ephemeral: true
                    });
                }

                if (!message) {
                    return interaction.reply({
                        content:
                            "กรุณาใส่ข้อความ",
                        ephemeral: true
                    });
                }

                await interaction.deferReply({
                    ephemeral: true
                });

                const setup =
                    await getGuildSetup(
                        interaction.guildId
                    );

                if (
                    !setup?.targetChannelId
                ) {
                    return interaction.editReply({
                        content:
                            "ระบบฝากบอกยังไม่ได้ตั้งค่าช่องปลายทาง\nกรุณาให้ผู้ดูแลใช้ `/setchannel` ก่อน"
                    });
                }

                const targetChannel =
                    await client.channels.fetch(
                        setup.targetChannelId
                    ).catch(() => null);

                const permissionCheck =
                    checkBotChannelPermissions(
                        targetChannel
                    );

                if (!permissionCheck.ok) {
                    return interaction.editReply({
                        content:
                            `ไม่สามารถส่งข้อความไปช่องที่ตั้งไว้ได้\nเหตุผล: ${permissionCheck.reason}`
                    });
                }

                const recipient =
                    await client.users.fetch(
                        targetUserId
                    ).catch(() => null);

                if (!recipient) {
                    return interaction.editReply({
                        content:
                            "ไม่พบผู้ใช้ดังกล่าวในระบบ"
                    });
                }

                if (recipient.bot) {
                    return interaction.editReply({
                        content:
                            "ไม่สามารถฝากข้อความถึงบอทได้"
                    });
                }

                // กันส่งหาตัวเองอีกชั้น
                if (
                    recipient.id ===
                    interaction.user.id
                ) {
                    return interaction.editReply({
                        content:
                            "ไม่สามารถฝากข้อความให้ตัวเองได้"
                    });
                }

                const newRecord = {
                    guildId:
                        interaction.guildId,

                    senderId:
                        interaction.user.id,

                    recipientId:
                        recipient.id,

                    originalMessage:
                        message,

                    clue:
                        clue || null,

                    replied: false,

                    reply: null,

                    repliedAt: null,

                    targetChannelId:
                        targetChannel.id,

                    discordMessageId:
                        null,

                    createdAt:
                        new Date()
                };

                let insertResult;

                try {
                    insertResult =
                        await anonymousMessages.insertOne(
                            newRecord
                        );
                } catch (error) {
                    console.error(
                        "Anonymous message DB insert error:",
                        sanitizeError(error)
                    );

                    return interaction.editReply({
                        content:
                            "ไม่สามารถบันทึกข้อความลงฐานข้อมูลได้"
                    });
                }

                const recordId =
                    insertResult.insertedId.toString();

                const embed =
                    buildAnonymousMessageEmbed(
                        newRecord
                    );

                const button =
                    buildReplyButton(
                        recordId
                    );

                try {
                    const publicMessage =
                        await targetChannel.send({
                            content:
                                `มีข้อความฝากบอกถึงคุณ <@${recipient.id}>`,

                            embeds: [embed],

                            components: [button]
                        });

                    await anonymousMessages.updateOne(
                        {
                            _id:
                                insertResult.insertedId
                        },
                        {
                            $set: {
                                discordMessageId:
                                    publicMessage.id,

                                targetChannelId:
                                    targetChannel.id
                            }
                        }
                    );

                    return interaction.editReply({
                        content:
                            `ฝากข้อความถึง <@${recipient.id}> เรียบร้อยแล้ว`
                    });
                } catch (error) {
                    console.error(
                        "Public Channel Send Error:",
                        sanitizeError(error)
                    );

                    await anonymousMessages.deleteOne({
                        _id:
                            insertResult.insertedId
                    }).catch(() => {});

                    return interaction.editReply({
                        content:
                            "ไม่สามารถส่งข้อความลงช่องที่กำหนดได้"
                    });
                }
            }

            // ==================================================
            // BUTTON: reply_button
            // ==================================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    "reply_button:"
                )
            ) {
                const recordId =
                    interaction.customId.slice(
                        "reply_button:".length
                    );

                if (
                    !ObjectId.isValid(
                        recordId
                    )
                ) {
                    return interaction.reply({
                        content:
                            "ข้อมูลข้อความไม่ถูกต้อง",
                        ephemeral: true
                    });
                }

                const record =
                    await anonymousMessages.findOne({
                        _id:
                            new ObjectId(
                                recordId
                            )
                    });

                if (!record) {
                    return interaction.reply({
                        content:
                            "ไม่พบข้อมูลข้อความนี้ในระบบ",
                        ephemeral: true
                    });
                }

                if (
                    record.recipientId !==
                    interaction.user.id
                ) {
                    return interaction.reply({
                        content:
                            "คุณไม่ใช่ผู้รับของข้อความนี้",
                        ephemeral: true
                    });
                }

                if (record.replied) {
                    return interaction.reply({
                        content:
                            "ข้อความนี้ถูกตอบกลับไปแล้ว",
                        ephemeral: true
                    });
                }

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            `reply_modal:${recordId}`
                        )
                        .setTitle(
                            "ตอบกลับ"
                        );

                const replyInput =
                    new TextInputBuilder()
                        .setCustomId(
                            "reply"
                        )
                        .setLabel(
                            "ข้อความตอบกลับ"
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(true)
                        .setMaxLength(1024);

                modal.addComponents(
                    new ActionRowBuilder()
                        .addComponents(
                            replyInput
                        )
                );

                return interaction.showModal(
                    modal
                );
            }

            // ==================================================
            // MODAL: reply_modal
            // ==================================================

            if (
                interaction.isModalSubmit() &&
                interaction.customId.startsWith(
                    "reply_modal:"
                )
            ) {
                const recordId =
                    interaction.customId.slice(
                        "reply_modal:".length
                    );

                const replyText =
                    interaction.fields
                        .getTextInputValue(
                            "reply"
                        )
                        .trim();

                if (
                    !ObjectId.isValid(
                        recordId
                    )
                ) {
                    return interaction.reply({
                        content:
                            "ข้อมูลข้อความไม่ถูกต้อง",
                        ephemeral: true
                    });
                }

                if (!replyText) {
                    return interaction.reply({
                        content:
                            "กรุณาใส่ข้อความตอบกลับ",
                        ephemeral: true
                    });
                }

                await interaction.deferReply({
                    ephemeral: true
                });

                const objectId =
                    new ObjectId(
                        recordId
                    );

                const record =
                    await anonymousMessages.findOne({
                        _id: objectId
                    });

                if (!record) {
                    return interaction.editReply({
                        content:
                            "ไม่พบข้อมูลข้อความนี้ในระบบ"
                    });
                }

                if (
                    record.recipientId !==
                    interaction.user.id
                ) {
                    return interaction.editReply({
                        content:
                            "คุณไม่ใช่ผู้รับของข้อความนี้"
                    });
                }

                // ==================================================
                // ATOMIC UPDATE
                // กันกดตอบพร้อมกันหลายครั้ง
                // ==================================================

                const updateResult =
                    await anonymousMessages.updateOne(
                        {
                            _id: objectId,

                            replied: false,

                            recipientId:
                                interaction.user.id
                        },
                        {
                            $set: {
                                replied: true,

                                reply:
                                    replyText,

                                repliedAt:
                                    new Date()
                            }
                        }
                    );

                if (
                    updateResult.modifiedCount !==
                    1
                ) {
                    return interaction.editReply({
                        content:
                            "ข้อความนี้ถูกตอบกลับไปแล้ว หรือสถานะไม่ถูกต้อง"
                    });
                }

                // ==================================================
                // UPDATE PUBLIC MESSAGE
                // ==================================================

                let publicEditSuccess =
                    false;

                if (
                    record.targetChannelId &&
                    record.discordMessageId
                ) {
                    const updatedRecord = {
                        ...record,

                        replied: true,

                        reply:
                            replyText
                    };

                    publicEditSuccess =
                        await editAnonymousChannelMessage(
                            record.targetChannelId,

                            record.discordMessageId,

                            buildRepliedEmbed(
                                updatedRecord,
                                replyText
                            ),

                            []
                        );
                }

                // ==================================================
                // SEND DM TO SENDER
                // ==================================================

                let dmSuccess = false;

                try {
                    const sender =
                        await client.users.fetch(
                            record.senderId
                        );

                    const notificationEmbed =
                        buildReplyNotificationEmbed(
                            record,
                            replyText
                        );

                    await sender.send({
                        embeds: [
                            notificationEmbed
                        ]
                    });

                    dmSuccess = true;
                } catch (error) {
                    console.error(
                        "Reply Notification DM Error:",
                        sanitizeError(error)
                    );
                }

                // ==================================================
                // RESULT
                // ==================================================

                if (
                    publicEditSuccess &&
                    dmSuccess
                ) {
                    return interaction.editReply({
                        content:
                            "ส่งข้อความตอบกลับเรียบร้อยแล้ว!"
                    });
                }

                if (
                    publicEditSuccess &&
                    !dmSuccess
                ) {
                    return interaction.editReply({
                        content:
                            "บันทึกคำตอบแล้ว แต่ไม่สามารถส่ง DM แจ้งผู้ส่งได้"
                    });
                }

                if (
                    !publicEditSuccess &&
                    dmSuccess
                ) {
                    return interaction.editReply({
                        content:
                            "บันทึกคำตอบและแจ้งผู้ส่งแล้ว แต่ไม่สามารถอัปเดตข้อความบนช่องหลักได้"
                    });
                }

                return interaction.editReply({
                    content:
                        "บันทึกคำตอบลงฐานข้อมูลแล้ว แต่ไม่สามารถอัปเดตช่องหลักและไม่สามารถส่ง DM ได้"
                });
            }

        } catch (error) {
            const interactionContext =
                interaction.commandName ||
                interaction.customId ||
                interaction.type ||
                "unknown-interaction";

            logDetailedError(
                `Interaction Error: ${interactionContext}`,
                error
            );

            const errorMessage = {
                content:
                    "เกิดข้อผิดพลาดในระบบ โปรดลองอีกครั้ง",
                ephemeral: true
            };

            try {
                if (
                    interaction.replied ||
                    interaction.deferred
                ) {
                    await interaction.editReply(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            } catch (replyError) {
                // Interaction อาจหมดอายุแล้ว (เช่น token หมดอายุ ~15 นาที
                // หรือ Unknown interaction) — log ไว้แทนเพื่อไม่ให้ error หายไปเฉยๆ
                // และไม่พยายามตอบซ้ำจนเกิด error เพิ่ม
                logDetailedError(
                    `Interaction Error Reply Failed: ${interactionContext}`,
                    replyError
                );
            }
        }
    }
);

// ======================================================
// 18. START BOT
// ======================================================

(async () => {
    try {
        // สำคัญ: ไม่ await connectDatabase() ตรงนี้
        // ให้ Mongo เชื่อมต่อใน background แทน เพื่อไม่ให้ MongoDB ที่ต่อช้า/ล่ม
        // ไปบล็อกหรือทำให้ Discord Bot login/register commands ไม่ได้
        connectDatabase().catch(error => {
            console.error(
                "❌ MongoDB background connection error:",
                sanitizeError(error)
            );
        });

        console.log(
            "🔄 Logging in to Discord..."
        );

        await client.login(TOKEN);
    } catch (error) {
        console.error(
            "❌ Startup Error:",
            sanitizeError(error)
        );

        process.exit(1);
    }
})();

// ======================================================
// 19. PROCESS ERROR HANDLERS
// ======================================================

process.on(
    "unhandledRejection",
    error => {
        // Promise rejection ธรรมดาไม่ควรทำให้บอทล่มทั้งตัว — แค่ log ไว้
        console.error(
            "❌ Unhandled Promise Rejection:",
            sanitizeError(error)
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        // Uncaught exception หมายความว่า process อยู่ในสถานะที่ไม่แน่นอนแล้ว
        // การพยายามทำงานต่อไปอาจไม่ปลอดภัย จึง log แล้ว exit เพื่อให้ Render
        // restart process ให้ใหม่ (fatal error ที่กู้คืนเองไม่ได้)
        console.error(
            "❌ Uncaught Exception (fatal, exiting):",
            sanitizeError(error)
        );

        process.exit(1);
    }
);

// ======================================================
// 20. GRACEFUL SHUTDOWN
// รองรับ SIGINT / SIGTERM — หยุด interval, background job, ปิด MongoDB,
// ปิด Discord Client, ปิด HTTP Server ตามลำดับ และป้องกันไม่ให้ทำงานซ้ำ
// ======================================================

let shuttingDown = false;

async function gracefulShutdown(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log(
        `🛑 ได้รับสัญญาณ ${signal} — กำลังปิดระบบอย่างปลอดภัย...`
    );

    // 1. หยุด interval ทั้งหมด
    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
    }

    if (statsFlushInterval) {
        clearInterval(statsFlushInterval);
        statsFlushInterval = null;
    }

    // 2. Flush global stats ที่ค้างอยู่ใน memory ก่อนปิด (best-effort)
    try {
        await flushGlobalStats();
    } catch (error) {
        console.error(
            "⚠️ Shutdown: flush stats error:",
            sanitizeError(error)
        );
    }

    // 3. ปิด MongoDB connection
    try {
        await mongo.close();
        mongoConnected = false;
        console.log("✅ ปิดการเชื่อมต่อ MongoDB แล้ว");
    } catch (error) {
        console.error(
            "⚠️ Shutdown: MongoDB close error:",
            sanitizeError(error)
        );
    }

    // 4. ปิด Discord Client
    try {
        client.destroy();
        console.log("✅ ปิดการเชื่อมต่อ Discord Client แล้ว");
    } catch (error) {
        console.error(
            "⚠️ Shutdown: Discord client destroy error:",
            sanitizeError(error)
        );
    }

    // 5. ปิด HTTP Server
    try {
        await new Promise((resolve, reject) => {
            httpServer.close(error => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });

        console.log("✅ ปิด HTTP Server แล้ว");
    } catch (error) {
        console.error(
            "⚠️ Shutdown: HTTP server close error:",
            sanitizeError(error)
        );
    }

    console.log("👋 ปิดระบบเรียบร้อยแล้ว");

    process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
