require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ChannelType } = require('discord.js');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// 자동청소 설정 파일 경로
const AUTO_CLEAN_FILE = path.join(__dirname, 'auto_clean.json');

// 자동청소 설정 불러오기
function loadAutoCleanSettings() {
    try {
        if (fs.existsSync(AUTO_CLEAN_FILE)) {
            return JSON.parse(fs.readFileSync(AUTO_CLEAN_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('[자동청소] 설정 불러오기 실패:', error);
    }
    return {};
}

// 자동청소 설정 저장
function saveAutoCleanSettings(settings) {
    try {
        fs.writeFileSync(AUTO_CLEAN_FILE, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('[자동청소] 설정 저장 실패:', error);
    }
}

// 자동청소 설정 및 타이머 저장
let autoCleanSettings = loadAutoCleanSettings();
const autoCleanTimers = new Map();

// 익명(대나무숲) 설정 파일 경로
const ANON_FILE = path.join(__dirname, 'anon_settings.json');

// 익명 설정 불러오기
function loadAnonSettings() {
    try {
        if (fs.existsSync(ANON_FILE)) {
            return JSON.parse(fs.readFileSync(ANON_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('[익명] 설정 불러오기 실패:', error);
    }
    return {};
}

// 익명 설정 저장
function saveAnonSettings(settings) {
    try {
        fs.writeFileSync(ANON_FILE, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('[익명] 설정 저장 실패:', error);
    }
}

// 익명 설정 및 쿨다운
let anonSettings = loadAnonSettings();
const anonCooldowns = new Map();

// 채널 자동청소 실행
async function executeAutoClean(channelId) {
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.log(`[자동청소] 채널을 찾을 수 없음: ${channelId}`);
            return;
        }

        let totalDeleted = 0;
        let deletedInBatch;

        do {
            const messages = await channel.messages.fetch({ limit: 100 });
            const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            const deletableMessages = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);

            if (deletableMessages.size === 0) break;

            const deleted = await channel.bulkDelete(deletableMessages, true);
            deletedInBatch = deleted.size;
            totalDeleted += deletedInBatch;

        } while (deletedInBatch > 0);

        console.log(`[자동청소] #${channel.name}: ${totalDeleted}개 메시지 삭제됨`);

    } catch (error) {
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
        .setDescription('익명 메시지가 올라갈 채널을 설정합니다 (관리자 전용)')
        .addChannelOption(option =>
            option.setName('채널')
                .setDescription('대나무숲 채널')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
        .setName('유동')
        .setDescription('익명으로 대나무숲에 메시지를 전송합니다')
        .addStringOption(option =>
            option.setName('내용')
                .setDescription('전송할 메시지 내용')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('고백')
        .setDescription('특정 유저에게 익명으로 메시지를 전송합니다')
        .addUserOption(option =>
            option.setName('대상')
                .setDescription('메시지를 받을 유저')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('내용')
                .setDescription('전송할 메시지 내용')
                .setRequired(true)
        )
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
});

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
            .setDescription(result.extract?.slice(0, 500) + '...' || '내용 없음')
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
                { name: '/자동청소 설정', value: '주기적 자동 삭제 (관리자)', inline: true }
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
            let totalDeleted = 0;
            let deletedInBatch;

            // 메시지 삭제 반복 (14일 이내 메시지만)
            do {
                const messages = await interaction.channel.messages.fetch({ limit: 100 });

                // 14일 이내 메시지만 필터링
                const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
                const deletableMessages = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);

                if (deletableMessages.size === 0) break;

                const deleted = await interaction.channel.bulkDelete(deletableMessages, true);
                deletedInBatch = deleted.size;
                totalDeleted += deletedInBatch;

                console.log(`[청소] ${deletedInBatch}개 메시지 삭제됨 (총 ${totalDeleted}개)`);

                // 전체 옵션이 아니면 개수 제한 체크
                if (!isAll && totalDeleted >= amount) break;

            } while (deletedInBatch > 0);

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
});

// 봇 로그인
client.login(process.env.DISCORD_TOKEN);
