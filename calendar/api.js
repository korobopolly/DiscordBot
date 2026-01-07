// Google Calendar API 호출 모듈
const { google } = require('googleapis');

// 오늘 일정 조회
async function getTodayEvents(oauth2Client, date = new Date()) {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 해당 날짜의 시작과 끝 (한국 시간 기준)
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 20
    });

    return response.data.items || [];
}

// 이벤트 시간 포맷팅
function formatEventTime(event) {
    if (event.start.dateTime) {
        // 시간이 있는 이벤트
        const start = new Date(event.start.dateTime);
        const end = new Date(event.end.dateTime);
        const startStr = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
        const endStr = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
        return `${startStr} - ${endStr}`;
    } else {
        // 종일 이벤트
        return '종일';
    }
}

// 일정 목록을 Discord 형식으로 포맷팅
function formatEventsForDiscord(events) {
    if (events.length === 0) {
        return '오늘 일정이 없습니다.';
    }

    return events.map(event => {
        const time = formatEventTime(event);
        const title = event.summary || '(제목 없음)';
        return `**${time}** ${title}`;
    }).join('\n');
}

// 날짜 문자열 파싱 (YYYY-MM-DD 또는 MM-DD)
function parseDate(dateStr) {
    if (!dateStr) return new Date();

    const today = new Date();

    // YYYY-MM-DD 형식
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return new Date(dateStr);
    }

    // MM-DD 형식 (올해로 가정)
    if (/^\d{2}-\d{2}$/.test(dateStr)) {
        return new Date(`${today.getFullYear()}-${dateStr}`);
    }

    // 오늘, 내일, 모레 키워드
    const keywords = {
        '오늘': 0,
        '내일': 1,
        '모레': 2
    };

    if (keywords[dateStr] !== undefined) {
        const date = new Date();
        date.setDate(date.getDate() + keywords[dateStr]);
        return date;
    }

    return null;
}

module.exports = {
    getTodayEvents,
    formatEventTime,
    formatEventsForDiscord,
    parseDate
};
