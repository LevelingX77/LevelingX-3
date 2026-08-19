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
            "https://cdn.discordapp.com/attachments/1538819802641211406/1539514882695893132/nyhearts_carrd.co.gif?ex=6a869876&is=6a8546f6&hm=54fc6a973a70bf60949d46eacfd02313482f59b844d6920d01bbd3518f97dd9f&",
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

if (!TOKEN || !CLIENT_ID || !MONGODB_URI) {
    console.error("❌ Missing required environment variables");
    console.error(
        "Required: DISCORD_TOKEN, CLIENT_ID, MONGODB_URI"
    );
    process.exit(1);
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
    res.status(200).json({
        status: "ok"
    });
});

app.listen(PORT, "0.0.0.0", () => {
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

async function connectDatabase(
    maxRetries = 5,
    retryDelay = 5000
) {
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

            console.log(
                "✅ MongoDB connected & indexes ready"
            );

            return true;
        } catch (error) {
            console.error(
                `❌ MongoDB attempt ${attempt} failed:`,
                sanitizeError(error)
            );

            if (attempt === maxRetries) {
                console.error(
                    "❌ Failed to connect to MongoDB."
                );

                process.exit(1);
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
        .setDMPermission(false)
].map(command => command.toJSON());

// ======================================================
// 10. REGISTER SLASH COMMANDS
// ======================================================

async function registerCommands() {
    try {
        console.log(
            "🔄 Registering slash commands..."
        );

        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            {
                body: commands
            }
        );

        console.log(
            "✅ Slash commands registered"
        );
    } catch (error) {
        console.error(
            "❌ Failed to register slash commands:",
            sanitizeError(error)
        );

        throw error;
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
            "📨 มีข้อความฝากบอกถึงคุณ"
        )
        .setDescription(
            `ถึง: <@${record.recipientId}> 🎉`
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
            "📨 ข้อความนี้ถูกตอบกลับแล้ว"
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
// 16. STARTUP
// ======================================================

client.once(
    Events.ClientReady,
    async readyClient => {
        try {
            console.log(
                `🤖 Logged in as ${readyClient.user.tag}`
            );

            await registerCommands();

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
// 17. INTERACTION HANDLER
// ======================================================

client.on(
    Events.InteractionCreate,
    async interaction => {
        try {

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
                            "คำสั่งนี้ใช้ได้เฉพาะคนที่มีสิทธิ์ผู้ดูแล",
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
                            "คำสั่งนี้ใช้ได้เฉพาะคนที่มีสิทธิ์ผู้ดูแล",
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
                            "ระบบฝากบอกยังไม่ได้ตั้งค่าช่องปลายทาง\nกรุณาให้คนที่มีสิทธิ์ผู้ดูแลใช้ `/setchannel` ก่อน",
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
                            "ข้อความตอบกลับ (สูงสุด 1024 ตัวอักษร)"
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
        await connectDatabase();

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
            "❌ Uncaught Exception:",
            sanitizeError(error)
        );
    }
);
