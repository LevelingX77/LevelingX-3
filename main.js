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


const app = express();

app.get("/", (req, res) => {
    res.status(200).send("yume Bot is online.");
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

let mongoConnected = false;

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


function scrubMongoCredentials(text) {
    return String(text ?? "").replace(
        /mongodb(?:\+srv)?:\/\/[^@]+@/g,
        "mongodb+srv://<CREDENTIALS_HIDDEN>@"
    );
}

function sanitizeError(error) {
    if (!error) {
        return "Unknown Error";
    }

    return scrubMongoCredentials(error.message || String(error));
}

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

                trySyncSetupPanelsOnce();

                return true;
            } catch (error) {
                mongoConnected = false;

                console.error(
                    `❌ MongoDB attempt ${attempt} failed:`,
                    sanitizeError(error)
                );

                if (attempt === maxRetries) {
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


let reconnectScheduled = false;
let reconnectAttemptCount = 0;

function scheduleDatabaseReconnect(delayMs) {
    if (reconnectScheduled) {
        return;
    }

    if (isMongoConnected()) {
        return;
    }

    reconnectScheduled = true;

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

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("วิธีการใช้บอท")
        .setDMPermission(true),

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

    new SlashCommandBuilder()
        .setName("update")
        .setDescription("...")
        .setDMPermission(true)
].map(command => command.toJSON());


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
        console.log("   Command ID:");
        result.forEach(c => {
            console.log(`     /${c.name} → ${c.id}`);
        });
        console.log(
            "   ℹ️ Global Commands อาจใช้เวลาสักพัก (โดยทั่วไปไม่กี่นาที แต่บางครั้งนานถึง ~1 ชม.) กว่าจะกระจายไปครบทุก Server — ไม่ต้อง register ซ้ำ แค่รอ"
        );
    } catch (error) {
        console.error(
            "❌ Failed to register slash commands:",
            sanitizeError(error)
        );

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

    }
}


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

    for (const guild of client.guilds.cache.values()) {
        await upsertGuildStats(guild);
    }
}


async function syncAllSetupPanels() {
    if (!guildSetups) {
        return;
    }

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
            type: 3
        });
    } catch (error) {
        console.error(
            "⚠️ Update presence error:",
            sanitizeError(error)
        );
    }
}

function startPresenceRotation() {
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

function safeTruncate(text, maxLength) {
    const str = String(text ?? "");

    if (str.length <= maxLength) {
        return str;
    }

    return Array.from(str).slice(0, Math.max(0, maxLength - 3)).join("") + "...";
}

function sanitizeAnnounceText(text) {
    return String(text ?? "")
        .replace(/@everyone/gi, "@\u200beveryone")
        .replace(/@here/gi, "@\u200bhere")
        .trim();
}

function isValidHttpUrl(value) {
    if (!value) {
        return true;
    }

    try {
        const url = new URL(value);

        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

const ANNOUNCE_UPDATE_LIST_MAX = 900;
const ANNOUNCE_PINK = "#FF69B4";
const UPDATE_FIELD_NAME = "\u200b";


const commandCooldowns = new Map();

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

const broadcastLocks = {
    update: false
};


const PERMANENT_DISCORD_ERROR_CODES = new Set([
    10001,
    10003,
    10004,
    10007,
    10008,
    10013,
    50001,
    50007,
    50013
]);

function isPermanentDiscordError(error) {
    return PERMANENT_DISCORD_ERROR_CODES.has(error?.code);
}

function createCancelToken() {
    return { cancelled: false };
}

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
                    failedCount += 1;

                    return {
                        id: task.id,
                        status: "failed",
                        permanent: true,
                        reason: sanitizeError(error)
                    };
                }

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

function buildUpdateFieldValue(draft) {
    const listBlock = draft.updateList ? draft.updateList.trim() : "";

    const wrapperLength = "```\n\n```".length;
    const maxListLength = Math.max(0, 1024 - wrapperLength - 3);

    const truncatedList =
        listBlock.length > maxListLength
            ? listBlock.slice(0, maxListLength) + "..."
            : listBlock;

    return `\`\`\`\n${truncatedList}\n\`\`\``;
}

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


const updateSessions = new Map();

function makeSessionId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;

    for (const [id, session] of updateSessions.entries()) {
        if (session.createdAt < cutoff) {
            updateSessions.delete(id);
        }
    }
}, 5 * 60 * 1000);


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
        console.log(
            `ℹ️ guildCreate(${guild.id}): ส่ง DM ต้อนรับไม่สำเร็จ:`,
            sanitizeError(error)
        );
    }
}


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

            startPresenceRotation();

            startStatsFlushInterval();

            syncAllGuildStats().catch(error => {
                console.error(
                    "⚠️ Initial guild stats sync error:",
                    sanitizeError(error)
                );
            });

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


client.on(
    Events.InteractionCreate,
    async interaction => {
        try {

            if (interaction.isChatInputCommand()) {
                incrementCommandsUsed();

                console.log(
                    `▶️ /${interaction.commandName} | Command ID: ${interaction.commandId} | User: ${interaction.user.id} | Guild: ${interaction.guildId ?? "DM"}`
                );
            }


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
                                "[ + ] เพิ่มฟีเจอร์ใหม่\n[ ~ ] ปรับปรุงระบบเดิม\n[ - ] แก้ไขบัค"
                            )
                    )
                );

                return interaction.showModal(modal);
            }


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

                        const mergedEmbed = buildUpdatedPanelEmbed(
                            panelMessage.embeds[0] || null,
                            session.draft
                        );

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


            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "owner-1"
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


            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "owner-2"
            ) {
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


            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    "servers_page:"
                )
            ) {
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
                logDetailedError(
                    `Interaction Error Reply Failed: ${interactionContext}`,
                    replyError
                );
            }
        }
    }
);


(async () => {
    try {
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


process.on(
    "unhandledRejection",
    error => {
        console.error(
            "❌ Unhandled Promise Rejection:",
            sanitizeError(error)
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "❌ Uncaught Exception (fatal, exiting):",
            sanitizeError(error)
        );

        process.exit(1);
    }
);


let shuttingDown = false;

async function gracefulShutdown(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log(
        `🛑 ได้รับสัญญาณ ${signal} — กำลังปิดระบบอย่างปลอดภัย...`
    );

    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
    }

    if (statsFlushInterval) {
        clearInterval(statsFlushInterval);
        statsFlushInterval = null;
    }

    try {
        await flushGlobalStats();
    } catch (error) {
        console.error(
            "⚠️ Shutdown: flush stats error:",
            sanitizeError(error)
        );
    }

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

    try {
        client.destroy();
        console.log("✅ ปิดการเชื่อมต่อ Discord Client แล้ว");
    } catch (error) {
        console.error(
            "⚠️ Shutdown: Discord client destroy error:",
            sanitizeError(error)
        );
    }

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
process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));
