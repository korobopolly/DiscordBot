require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ChannelType } = require('discord.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// 캘린더 모듈
const calendarAuth = require('./calendar/auth');
const calendarApi = require('./calendar/api');
const calendarScheduler = require('./calendar/scheduler');

// ===== 상수 정의 =====
const TIME = {
    SECOND: 1000,
    MINUTE: 60 * 1000,
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    TWO_WEEKS: 14 * 24 * 60 * 60 * 1000
};

const COOLDOWN = {
    ANON_POST: TIME.MINUTE,           // 유동: 1분
    CONFESSION: 3 * TIME.MINUTE       // 고백: 3분
};

const LIMITS = {
    MESSAGE_FETCH: 100,               // 한 번에 가져올 최대 메시지 수
    BULK_DELETE_AGE: TIME.TWO_WEEKS   // bulkDelete 가능한 메시지 최대 나이
};

// ===== 설정 파일 경로 =====
const AUTO_CLEAN_FILE = path.join(__dirname, 'auto_clean.json');

// ===== 범용 설정 관리 함수 =====
function loadSettings(filePath, logPrefix) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        console.error(`[${logPrefix}] 설정 불러오기 실패:`, error);
    }
    return {};
}

function saveSettings(filePath, settings, logPrefix) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error(`[${logPrefix}] 설정 저장 실패:`, error);
    }
}

// 래퍼 함수 (기존 호출부 호환)
const loadAutoCleanSettings = () => loadSettings(AUTO_CLEAN_FILE, '자동청소');
const saveAutoCleanSettings = (settings) => saveSettings(AUTO_CLEAN_FILE, settings, '자동청소');

// 자동청소 설정 및 타이머 저장
let autoCleanSettings = loadAutoCleanSettings();
const autoCleanTimers = new Map();

// 익명(디씨) 설정 파일 경로
const ANON_FILE = path.join(__dirname, 'anon_settings.json');

// 래퍼 함수 (익명 설정)
const loadAnonSettings = () => loadSettings(ANON_FILE, '익명');
const saveAnonSettings = (settings) => saveSettings(ANON_FILE, settings, '익명');

// 익명 설정 및 쿨다운
let anonSettings = loadAnonSettings();
const anonCooldowns = new Map();

// ===== 캘린더 설정 =====
const CALENDAR_TOKENS_FILE = path.join(__dirname, 'calendar_tokens.json');
const CALENDAR_SETTINGS_FILE = path.join(__dirname, 'calendar_settings.json');

const loadCalendarTokens = () => loadSettings(CALENDAR_TOKENS_FILE, '캘린더토큰');
const saveCalendarTokens = (settings) => saveSettings(CALENDAR_TOKENS_FILE, settings, '캘린더토큰');
const loadCalendarSettings = () => loadSettings(CALENDAR_SETTINGS_FILE, '캘린더알림');
const saveCalendarSettings = (settings) => saveSettings(CALENDAR_SETTINGS_FILE, settings, '캘린더알림');

let calendarTokens = loadCalendarTokens();
let calendarSettings = loadCalendarSettings();

// ===== 쿨다운 관리 함수 =====
function checkCooldown(cooldownMap, key) {
    if (cooldownMap.has(key)) {
        const remaining = Math.ceil((cooldownMap.get(key) - Date.now()) / TIME.SECOND);
        if (remaining > 0) {
            return remaining;
        }
    }
    return null;
}

function setCooldown(cooldownMap, key, durationMs) {
    cooldownMap.set(key, Date.now() + durationMs);
    setTimeout(() => cooldownMap.delete(key), durationMs);
}

async function handleCooldownCheck(interaction, cooldownMap, key) {
    const remaining = checkCooldown(cooldownMap, key);
    if (remaining !== null) {
        await interaction.reply({
            content: `잠시 후에 다시 시도해주세요. (${remaining}초 남음)`,
            ephemeral: true
        });
        return true;
    }
    return false;
}

// ===== 메시지 삭제 함수 =====
async function bulkDeleteMessages(channel, options = {}) {
    const { maxMessages = Infinity } = options;
    let totalDeleted = 0;
    let deletedInBatch;

    do {
        const messages = await channel.messages.fetch({ limit: LIMITS.MESSAGE_FETCH });
        const cutoffTime = Date.now() - LIMITS.BULK_DELETE_AGE;
        const deletableMessages = messages.filter(msg => msg.createdTimestamp > cutoffTime);

        if (deletableMessages.size === 0) break;

        const deleted = await channel.bulkDelete(deletableMessages, true);
        deletedInBatch = deleted.size;
        totalDeleted += deletedInBatch;

        if (totalDeleted >= maxMessages) break;

    } while (deletedInBatch > 0);

    return totalDeleted;
}

// 채널 자동청소 실행
async function executeAutoClean(channelId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            // 채널 삭제됨 - 설정 정리
            stopAutoCleanTimer(channelId);
            delete autoCleanSettings[channelId];
            saveAutoCleanSettings(autoCleanSettings);
            console.log(`[자동청소] 채널 삭제됨, 설정 제거: ${channelId}`);
            return;
        }

        const totalDeleted = await bulkDeleteMessages(channel);
        console.log(`[자동청소] #${channel.name}: ${totalDeleted}개 메시지 삭제됨`);

    } catch (error) {
        // 채널 접근 불가 시 설정 정리
        if (error.code === 10003 || error.code === 50001) {
            stopAutoCleanTimer(channelId);
            delete autoCleanSettings[channelId];
            saveAutoCleanSettings(autoCleanSettings);
            console.log(`[자동청소] 채널 접근 불가, 설정 제거: ${channelId}`);
            return;
        }
        console.error(`[자동청소] 에러 (${channelId}):`, error.message);
    }
}

// 자동청소 타이머 시작
function startAutoCleanTimer(channelId, intervalHours) {
    // 기존 타이머 제거
    if (autoCleanTimers.has(channelId)) {
        clearInterval(autoCleanTimers.get(channelId));
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;
    const timer = setInterval(() => executeAutoClean(channelId), intervalMs);
    autoCleanTimers.set(channelId, timer);

    console.log(`[자동청소] 타이머 시작: ${channelId} (${intervalHours}시간 간격)`);
}

// 자동청소 타이머 중지
function stopAutoCleanTimer(channelId) {
    if (autoCleanTimers.has(channelId)) {
        clearInterval(autoCleanTimers.get(channelId));
        autoCleanTimers.delete(channelId);
        console.log(`[자동청소] 타이머 중지: ${channelId}`);
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 슬래시 명령어 정의
const commands = [
    new SlashCommandBuilder()
        .setName('위키')
        .setDescription('위키피디아에서 검색합니다')
        .addStringOption(option =>
            option.setName('검색어')
                .setDescription('검색할 내용')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('나무위키')
        .setDescription('나무위키에서 검색합니다')
        .addStringOption(option =>
            option.setName('검색어')
                .setDescription('검색할 내용')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('도움말')
        .setDescription('봇 사용법을 보여줍니다'),
    new SlashCommandBuilder()
        .setName('청소')
        .setDescription('메시지를 삭제합니다 (관리자 전용)')
        .addBooleanOption(option =>
            option.setName('전체삭제')
                .setDescription('14일 이내 모든 메시지 삭제')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('개수')
                .setDescription('삭제할 메시지 개수 (1-100, 기본값: 100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder()
        .setName('자동청소')
        .setDescription('자동 메시지 청소를 설정합니다 (관리자 전용)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('설정')
                .setDescription('자동청소를 설정합니다')
                .addChannelOption(option =>
                    option.setName('채널')
                        .setDescription('자동청소할 채널')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('간격')
                        .setDescription('청소 간격 (시간 단위)')
                        .setMinValue(1)
                        .setMaxValue(168)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('해제')
                .setDescription('자동청소를 해제합니다')
                .addChannelOption(option =>
                    option.setName('채널')
                        .setDescription('자동청소를 해제할 채널')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('목록')
                .setDescription('자동청소 설정 목록을 확인합니다')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder()
        .setName('디씨주소')
        .setDescription('디씨 주소를 설정합니다 (관리자)')
        .addChannelOption(option =>
            option.setName('채널')
                .setDescription('익명 글이 올라올 채널')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
        .setName('유동')
        .setDescription('디씨에 익명으로 글을 씁니다')
        .addStringOption(option =>
            option.setName('내용')
                .setDescription('하고 싶은 말')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('고백')
        .setDescription('누군가에게 익명으로 마음을 전합니다')
        .addUserOption(option =>
            option.setName('대상')
                .setDescription('마음을 전할 상대')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('내용')
                .setDescription('전하고 싶은 말')
                .setRequired(true)
        ),
    // ===== 캘린더 명령어 =====
    new SlashCommandBuilder()
        .setName('캘린더연동')
        .setDescription('Google 캘린더를 연동합니다')
        .addStringOption(option =>
            option.setName('코드')
                .setDescription('Google 인증 코드 (없으면 인증 URL 발급)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('캘린더해제')
        .setDescription('Google 캘린더 연동을 해제합니다'),
    new SlashCommandBuilder()
        .setName('내일정')
        .setDescription('오늘의 일정을 확인합니다')
        .addStringOption(option =>
            option.setName('날짜')
                .setDescription('조회할 날짜 (예: 2026-01-08, 내일, 모레)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('알림설정')
        .setDescription('매일 일정 알림을 설정합니다')
        .addStringOption(option =>
            option.setName('시간')
                .setDescription('알림 시간 (예: 08:00)')
                .setRequired(true)
        )
        .addChannelOption(option =>
            option.setName('채널')
                .setDescription('알림 받을 채널 (선택 안하면 DM)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('알림해제')
        .setDescription('일정 알림을 해제합니다')
].map(command => command.toJSON());

// 위키피디아 검색 함수
async function wikiSearch(query, lang = 'ko') {
    try {
        const searchUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        console.log(`[위키] 검색 URL: ${searchUrl}`);

        const response = await fetch(searchUrl);
        console.log(`[위키] 응답 상태: ${response.status}`);

        if (!response.ok) {
            // 검색어로 문서 찾기
            const searchApiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
            console.log(`[위키] 검색 API URL: ${searchApiUrl}`);

            const searchResponse = await fetch(searchApiUrl);
            const searchData = await searchResponse.json();
            console.log(`[위키] 검색 결과 수: ${searchData.query?.search?.length || 0}`);

            if (searchData.query?.search?.length > 0) {
                const firstResult = searchData.query.search[0].title;
                console.log(`[위키] 첫 번째 결과: ${firstResult}`);

                const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstResult)}`;
                const summaryResponse = await fetch(summaryUrl);
                const summaryData = await summaryResponse.json();
                console.log(`[위키] 요약 제목: ${summaryData.title}`);
                return summaryData;
            }
            console.log('[위키] 검색 결과 없음');
            return null;
        }

        const data = await response.json();
        console.log(`[위키] 문서 제목: ${data.title}`);
        return data;
    } catch (error) {
        console.error('[위키] 검색 에러:', error);
        return null;
    }
}

// 나무위키 검색 함수
async function namuSearch(query) {
    try {
        const searchUrl = `https://namu.wiki/w/${encodeURIComponent(query)}`;
        console.log(`[나무위키] 검색 URL: ${searchUrl}`);

        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log(`[나무위키] 응답 상태: ${response.status}`);

        if (response.ok) {
            console.log(`[나무위키] 문서 존재: ${query}`);
            return {
                title: query,
                url: searchUrl,
                exists: true
            };
        }
        console.log(`[나무위키] 문서 없음: ${query}`);
        return { exists: false };
    } catch (error) {
        console.error('[나무위키] 검색 에러:', error);
        return { exists: false };
    }
}

// 봇 준비 완료
client.once('ready', async () => {
    console.log(`${client.user.tag} 봇이 온라인입니다!`);

    // 슬래시 명령어 등록
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('슬래시 명령어 등록 중...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('슬래시 명령어 등록 완료!');
    } catch (error) {
        console.error('명령어 등록 오류:', error);
    }

    // 저장된 자동청소 설정 복원
    for (const [channelId, settings] of Object.entries(autoCleanSettings)) {
        startAutoCleanTimer(channelId, settings.intervalHours);
    }
    console.log(`[자동청소] ${Object.keys(autoCleanSettings).length}개 채널 설정 복원됨`);

    // 저장된 캘린더 알림 설정 복원
    calendarScheduler.restoreAllSchedules(calendarSettings, sendCalendarNotification);
});

// 캘린더 알림 전송 함수
async function sendCalendarNotification(userId) {
    try {
        const tokens = calendarTokens[userId];
        const settings = calendarSettings[userId];

        if (!tokens || !settings || !settings.enabled) {
            return;
        }

        // 토큰 갱신 필요 여부 확인
        let oauth2Client;
        if (calendarAuth.isTokenExpired(tokens)) {
            try {
                const newTokens = await calendarAuth.refreshAccessToken(tokens);
                calendarTokens[userId] = newTokens;
                saveCalendarTokens(calendarTokens);
                oauth2Client = calendarAuth.getAuthenticatedClient(newTokens);
            } catch (error) {
                console.error(`[캘린더] 토큰 갱신 실패 (${userId}):`, error.message);
                return;
            }
        } else {
            oauth2Client = calendarAuth.getAuthenticatedClient(tokens);
        }

        // 오늘 일정 조회
        const events = await calendarApi.getTodayEvents(oauth2Client);
        const formattedEvents = calendarApi.formatEventsForDiscord(events);

        const embed = new EmbedBuilder()
            .setColor(0x34A853)
            .setTitle('🔔 오늘의 일정 알림')
            .setDescription(formattedEvents)
            .setFooter({ text: '매일 알림 | /알림해제로 끄기' })
            .setTimestamp();

        // DM 또는 채널로 전송
        if (settings.channelId) {
            const channel = await client.channels.fetch(settings.channelId);
            if (channel) {
                await channel.send({ content: `<@${userId}>`, embeds: [embed] });
            }
        } else {
            const user = await client.users.fetch(userId);
            if (user) {
                await user.send({ embeds: [embed] });
            }
        }

        console.log(`[캘린더] 알림 전송 완료: ${userId}`);

    } catch (error) {
        console.error(`[캘린더] 알림 전송 실패 (${userId}):`, error.message);
    }
}

// 슬래시 명령어 처리
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // 위키피디아 검색
    if (commandName === '위키') {
        await interaction.deferReply();
        const query = interaction.options.getString('검색어');
        const result = await wikiSearch(query);

        if (!result || result.type === 'not_found') {
            await interaction.editReply('위키피디아에서 해당 문서를 찾을 수 없습니다.');
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`📚 ${result.title}`)
            .setURL(result.content_urls?.desktop?.page || `https://ko.wikipedia.org/wiki/${encodeURIComponent(query)}`)
            .setDescription(result.extract
                ? (result.extract.length > 500 ? result.extract.slice(0, 500) + '...' : result.extract)
                : '내용 없음')
            .setFooter({ text: 'Wikipedia' })
            .setTimestamp();

        if (result.thumbnail?.source) {
            embed.setThumbnail(result.thumbnail.source);
        }

        await interaction.editReply({ embeds: [embed] });
    }

    // 나무위키 검색
    if (commandName === '나무위키') {
        await interaction.deferReply();
        const query = interaction.options.getString('검색어');
        const result = await namuSearch(query);

        const embed = new EmbedBuilder()
            .setColor(0x00A495)
            .setTitle(`🌳 ${query}`)
            .setURL(`https://namu.wiki/w/${encodeURIComponent(query)}`)
            .setDescription(result.exists
                ? `[나무위키에서 "${query}" 문서 보기](https://namu.wiki/w/${encodeURIComponent(query)})`
                : `문서가 없을 수 있습니다. [검색해보기](https://namu.wiki/search?q=${encodeURIComponent(query)})`)
            .setFooter({ text: '나무위키' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }

    // 도움말
    if (commandName === '도움말') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📖 봇 사용법')
            .setDescription('검색 유틸리티 봇입니다.')
            .addFields(
                { name: '/위키 [검색어]', value: '위키피디아에서 검색합니다', inline: true },
                { name: '/나무위키 [검색어]', value: '나무위키에서 검색합니다', inline: true },
                { name: '/청소 [개수]', value: '메시지 삭제 (관리자)', inline: true },
                { name: '/자동청소 설정', value: '주기적 자동 삭제 (관리자)', inline: true },
                { name: '/유동 [내용]', value: '디씨에 익명 글쓰기', inline: true },
                { name: '/고백 [유저] [내용]', value: '익명으로 마음 전하기', inline: true },
                { name: '/캘린더연동', value: 'Google 캘린더 연동', inline: true },
                { name: '/내일정 [날짜]', value: '일정 확인', inline: true },
                { name: '/알림설정 [시간]', value: '매일 일정 알림', inline: true }
            )
            .setFooter({ text: 'Utility Bot' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // 청소 (메시지 삭제)
    if (commandName === '청소') {
        // 권한 체크
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            await interaction.reply({
                content: '이 명령어를 사용할 권한이 없습니다. (메시지 관리 권한 필요)',
                ephemeral: true
            });
            return;
        }

        // 봇 권한 체크
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            await interaction.reply({
                content: '봇에 메시지 관리 권한이 없습니다. 서버 설정에서 봇 권한을 확인해주세요.',
                ephemeral: true
            });
            return;
        }

        const isAll = interaction.options.getBoolean('전체삭제') || false;
        const amount = interaction.options.getInteger('개수') || 100;

        await interaction.deferReply({ ephemeral: true });

        try {
            const maxMessages = isAll ? Infinity : amount;
            const totalDeleted = await bulkDeleteMessages(interaction.channel, { maxMessages });

            console.log(`[청소] 총 ${totalDeleted}개 메시지 삭제됨`);

            await interaction.editReply({
                content: `${totalDeleted}개의 메시지를 삭제했습니다.\n(14일 이상 된 메시지는 삭제할 수 없습니다)`
            });

        } catch (error) {
            console.error('[청소] 에러:', error);
            await interaction.editReply({
                content: '메시지 삭제 중 오류가 발생했습니다.'
            });
        }
    }

    // 자동청소
    if (commandName === '자동청소') {
        const subcommand = interaction.options.getSubcommand();

        // 설정
        if (subcommand === '설정') {
            const channel = interaction.options.getChannel('채널');
            const intervalHours = interaction.options.getInteger('간격');

            // 설정 저장
            autoCleanSettings[channel.id] = {
                channelName: channel.name,
                guildId: interaction.guild.id,
                intervalHours: intervalHours,
                createdAt: new Date().toISOString()
            };
            saveAutoCleanSettings(autoCleanSettings);

            // 타이머 시작
            startAutoCleanTimer(channel.id, intervalHours);

            // 첫 실행 여부 확인
            await interaction.reply({
                content: `<#${channel.id}> 채널에 ${intervalHours}시간마다 자동청소가 설정되었습니다.\n지금 바로 청소를 실행하려면 \`/청소\` 명령어를 사용하세요.`,
                ephemeral: true
            });
        }

        // 해제
        if (subcommand === '해제') {
            const channel = interaction.options.getChannel('채널');

            if (!autoCleanSettings[channel.id]) {
                await interaction.reply({
                    content: `<#${channel.id}> 채널에는 자동청소가 설정되어 있지 않습니다.`,
                    ephemeral: true
                });
                return;
            }

            // 타이머 중지 및 설정 삭제
            stopAutoCleanTimer(channel.id);
            delete autoCleanSettings[channel.id];
            saveAutoCleanSettings(autoCleanSettings);

            await interaction.reply({
                content: `<#${channel.id}> 채널의 자동청소가 해제되었습니다.`,
                ephemeral: true
            });
        }

        // 목록
        if (subcommand === '목록') {
            const guildSettings = Object.entries(autoCleanSettings)
                .filter(([_, settings]) => settings.guildId === interaction.guild.id);

            if (guildSettings.length === 0) {
                await interaction.reply({
                    content: '설정된 자동청소가 없습니다.',
                    ephemeral: true
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔄 자동청소 목록')
                .setDescription(guildSettings.map(([channelId, settings]) =>
                    `<#${channelId}> - **${settings.intervalHours}시간**마다`
                ).join('\n'))
                .setFooter({ text: `총 ${guildSettings.length}개 채널` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    // 디씨주소 (디씨 채널 설정)
    if (commandName === '디씨주소') {
        const channel = interaction.options.getChannel('채널');

        anonSettings[interaction.guild.id] = {
            channelId: channel.id,
            channelName: channel.name,
            createdAt: new Date().toISOString()
        };
        saveAnonSettings(anonSettings);

        await interaction.reply({
            content: `<#${channel.id}>이 디씨 주소로 지정되었습니다.\n이제 \`/유동\` 명령어로 익명 글을 쓸 수 있습니다.`,
            ephemeral: true
        });
    }

    // 유동 (익명 메시지)
    if (commandName === '유동') {
        const content = interaction.options.getString('내용');
        const guildId = interaction.guild.id;

        // 디씨 채널 설정 확인
        if (!anonSettings[guildId]) {
            await interaction.reply({
                content: '아직 디씨 주소가 없습니다. 관리자에게 `/디씨주소` 설정을 요청하세요.',
                ephemeral: true
            });
            return;
        }

        // 쿨다운 체크 (1분)
        const cooldownKey = `${guildId}-${interaction.user.id}`;
        if (await handleCooldownCheck(interaction, anonCooldowns, cooldownKey)) {
            return;
        }

        try {
            const channel = await client.channels.fetch(anonSettings[guildId].channelId);

            const embed = new EmbedBuilder()
                .setColor(0x2F3136)
                .setAuthor({ name: 'ㅇㅇ (익명)', iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' })
                .setDescription(content)
                .setFooter({ text: '디씨' })
                .setTimestamp();

            await channel.send({ embeds: [embed] });

            // 쿨다운 설정
            setCooldown(anonCooldowns, cooldownKey, COOLDOWN.ANON_POST);

            await interaction.reply({
                content: '디씨에 글이 올라갔습니다.',
                ephemeral: true
            });

            console.log(`[유동] ${interaction.user.tag}`);

        } catch (error) {
            console.error('[유동] 에러:', error);
            await interaction.reply({
                content: '메시지 전송에 실패했습니다.',
                ephemeral: true
            });
        }
    }

    // 고백 (특정 유저에게 익명 DM)
    if (commandName === '고백') {
        const targetUser = interaction.options.getUser('대상');
        const content = interaction.options.getString('내용');

        // 자기 자신에게 보내기 방지
        if (targetUser.id === interaction.user.id) {
            await interaction.reply({
                content: '자기 자신에게는 보낼 수 없습니다.',
                ephemeral: true
            });
            return;
        }

        // 봇에게 보내기 방지
        if (targetUser.bot) {
            await interaction.reply({
                content: '봇에게는 보낼 수 없습니다.',
                ephemeral: true
            });
            return;
        }

        // 쿨다운 체크 (3분)
        const cooldownKey = `confession-${interaction.user.id}`;
        if (await handleCooldownCheck(interaction, anonCooldowns, cooldownKey)) {
            return;
        }

        try {
            const embed = new EmbedBuilder()
                .setColor(0xFF6B9D)
                .setTitle('💌 누군가의 마음')
                .setDescription(content)
                .setFooter({ text: `${interaction.guild.name}에서 보낸 익명 메시지` })
                .setTimestamp();

            await targetUser.send({ embeds: [embed] });

            // 쿨다운 설정
            setCooldown(anonCooldowns, cooldownKey, COOLDOWN.CONFESSION);

            await interaction.reply({
                content: `${targetUser.username}님에게 마음을 전했습니다.`,
                ephemeral: true
            });

            console.log(`[고백] ${interaction.user.tag} → ${targetUser.tag}`);

        } catch (error) {
            console.error('[고백] 에러:', error);
            await interaction.reply({
                content: '전송에 실패했습니다. 상대방이 DM을 막아뒀을 수 있어요.',
                ephemeral: true
            });
        }
    }

    // ===== 캘린더 명령어 =====

    // 캘린더연동
    if (commandName === '캘린더연동') {
        const code = interaction.options.getString('코드');
        const userId = interaction.user.id;

        // Google OAuth 설정 확인
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
            await interaction.reply({
                content: '캘린더 기능이 설정되지 않았습니다. 관리자에게 문의하세요.',
                ephemeral: true
            });
            return;
        }

        // 코드 없이 실행 → 인증 URL 발급
        if (!code) {
            const authUrl = calendarAuth.generateAuthUrl();

            const embed = new EmbedBuilder()
                .setColor(0x4285F4)
                .setTitle('📅 Google 캘린더 연동')
                .setDescription('아래 링크를 클릭하여 Google 로그인 후,\n표시되는 **인증 코드**를 복사하세요.')
                .addFields(
                    { name: '1️⃣ 로그인 링크', value: `[Google 로그인](${authUrl})` },
                    { name: '2️⃣ 코드 입력', value: '`/캘린더연동 코드:여기에붙여넣기`' }
                )
                .setFooter({ text: '인증 코드는 1회용입니다' });

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        // 코드로 토큰 교환
        await interaction.deferReply({ ephemeral: true });

        try {
            const tokens = await calendarAuth.getTokenFromCode(code);

            calendarTokens[userId] = {
                ...tokens,
                linkedAt: new Date().toISOString()
            };
            saveCalendarTokens(calendarTokens);

            await interaction.editReply({
                content: '✅ Google 캘린더 연동이 완료되었습니다!\n`/내일정`으로 일정을 확인해보세요.'
            });

            console.log(`[캘린더] 연동 완료: ${interaction.user.tag}`);

        } catch (error) {
            console.error('[캘린더] 연동 에러:', error);
            await interaction.editReply({
                content: '❌ 인증 코드가 잘못되었거나 만료되었습니다.\n`/캘린더연동`으로 다시 시도해주세요.'
            });
        }
    }

    // 캘린더해제
    if (commandName === '캘린더해제') {
        const userId = interaction.user.id;

        if (!calendarTokens[userId]) {
            await interaction.reply({
                content: '연동된 캘린더가 없습니다.',
                ephemeral: true
            });
            return;
        }

        // 토큰 삭제
        delete calendarTokens[userId];
        saveCalendarTokens(calendarTokens);

        // 알림 설정도 삭제
        if (calendarSettings[userId]) {
            calendarScheduler.cancelNotification(userId);
            delete calendarSettings[userId];
            saveCalendarSettings(calendarSettings);
        }

        await interaction.reply({
            content: '✅ 캘린더 연동이 해제되었습니다.',
            ephemeral: true
        });

        console.log(`[캘린더] 연동 해제: ${interaction.user.tag}`);
    }

    // 내일정
    if (commandName === '내일정') {
        const userId = interaction.user.id;
        const dateStr = interaction.options.getString('날짜');

        // 연동 확인
        if (!calendarTokens[userId]) {
            await interaction.reply({
                content: '캘린더가 연동되어 있지 않습니다.\n`/캘린더연동`으로 먼저 연동해주세요.',
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // 날짜 파싱
            const date = calendarApi.parseDate(dateStr);
            if (date === null) {
                await interaction.editReply({
                    content: '❌ 날짜 형식이 잘못되었습니다.\n예: `2026-01-08`, `01-08`, `오늘`, `내일`, `모레`'
                });
                return;
            }

            // 토큰 갱신 필요 여부 확인
            let tokens = calendarTokens[userId];
            if (calendarAuth.isTokenExpired(tokens)) {
                try {
                    tokens = await calendarAuth.refreshAccessToken(tokens);
                    calendarTokens[userId] = tokens;
                    saveCalendarTokens(calendarTokens);
                } catch (error) {
                    await interaction.editReply({
                        content: '❌ 인증이 만료되었습니다.\n`/캘린더연동`으로 다시 연동해주세요.'
                    });
                    return;
                }
            }

            const oauth2Client = calendarAuth.getAuthenticatedClient(tokens);
            const events = await calendarApi.getTodayEvents(oauth2Client, date);
            const formattedEvents = calendarApi.formatEventsForDiscord(events);

            const dateDisplay = date.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });

            const embed = new EmbedBuilder()
                .setColor(0x4285F4)
                .setTitle(`📅 ${dateDisplay}`)
                .setDescription(formattedEvents)
                .setFooter({ text: 'Google Calendar' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[캘린더] 일정 조회 에러:', error);
            await interaction.editReply({
                content: '❌ 일정을 불러오는 중 오류가 발생했습니다.'
            });
        }
    }

    // 알림설정
    if (commandName === '알림설정') {
        const userId = interaction.user.id;
        const time = interaction.options.getString('시간');
        const channel = interaction.options.getChannel('채널');

        // 연동 확인
        if (!calendarTokens[userId]) {
            await interaction.reply({
                content: '캘린더가 연동되어 있지 않습니다.\n`/캘린더연동`으로 먼저 연동해주세요.',
                ephemeral: true
            });
            return;
        }

        // 시간 형식 확인
        if (!calendarScheduler.isValidTimeFormat(time)) {
            await interaction.reply({
                content: '❌ 시간 형식이 잘못되었습니다.\n예: `08:00`, `14:30`',
                ephemeral: true
            });
            return;
        }

        // 설정 저장
        calendarSettings[userId] = {
            notificationTime: time,
            channelId: channel ? channel.id : null,
            guildId: interaction.guild?.id || null,
            enabled: true,
            createdAt: new Date().toISOString()
        };
        saveCalendarSettings(calendarSettings);

        // 스케줄 등록
        calendarScheduler.scheduleNotification(userId, time, sendCalendarNotification);

        const targetStr = channel ? `<#${channel.id}>` : 'DM';
        await interaction.reply({
            content: `✅ 매일 **${time}**에 ${targetStr}(으)로 일정 알림을 보내드릴게요!`,
            ephemeral: true
        });

        console.log(`[캘린더] 알림 설정: ${interaction.user.tag} (${time})`);
    }

    // 알림해제
    if (commandName === '알림해제') {
        const userId = interaction.user.id;

        if (!calendarSettings[userId]) {
            await interaction.reply({
                content: '설정된 알림이 없습니다.',
                ephemeral: true
            });
            return;
        }

        // 스케줄 취소 및 설정 삭제
        calendarScheduler.cancelNotification(userId);
        delete calendarSettings[userId];
        saveCalendarSettings(calendarSettings);

        await interaction.reply({
            content: '✅ 일정 알림이 해제되었습니다.',
            ephemeral: true
        });

        console.log(`[캘린더] 알림 해제: ${interaction.user.tag}`);
    }
});

// 봇 로그인
client.login(process.env.DISCORD_TOKEN);
