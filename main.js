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
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
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
            "https://cdn.discordapp.com/attachments/1539965115900629003/1542078143563833374/Ad3-7cdFqb0b5hwsLufYYwaUhdlfSM28Vt7DERCwPSw.gif?ex=6a8febaf&is=6a8e9a2f&hm=9d405dd201390abed9ca6df19f481a2c9215de5b39b44b108dda24beaf57785f&",
        thumbnail: "",
        footer: "LevelingX"
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

function sanitizeError(error) {
    if (!error) {
        return "Unknown Error";
    }

    let message = error.message || String(error);

    return message.replace(
        /mongodb(?:\+srv)?:\/\/[^@]+@/g,
        "mongodb+srv://<CREDENTIALS_HIDDEN>@"
    );
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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
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
            console.error(
                "❌ Interaction Error:",
                sanitizeError(error)
            );

            const errorMessage = {
                content:
                    "เกิดข้อผิดพลาดในระบบ โปรดลองอีกครั้ง",
                ephemeral: true
            };

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                await interaction.editReply(
                    errorMessage
                ).catch(() => {});
            } else {
                await interaction.reply(
                    errorMessage
                ).catch(() => {});
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
