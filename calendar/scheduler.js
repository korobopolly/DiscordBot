// 캘린더 알림 스케줄러 모듈
const schedule = require('node-schedule');

// 사용자별 스케줄 저장
const userSchedules = new Map();

// 알림 스케줄 등록
function scheduleNotification(userId, time, callback) {
    // 기존 스케줄 취소
    if (userSchedules.has(userId)) {
        userSchedules.get(userId).cancel();
    }

    const [hour, minute] = time.split(':').map(Number);

    // cron 규칙: 매일 해당 시간 (한국 시간대)
    const rule = new schedule.RecurrenceRule();
    rule.hour = hour;
    rule.minute = minute;
    rule.tz = 'Asia/Seoul';

    const job = schedule.scheduleJob(rule, () => callback(userId));
    userSchedules.set(userId, job);

    console.log(`[캘린더] 알림 스케줄 등록: ${userId} (${time})`);
    return true;
}

// 알림 스케줄 취소
function cancelNotification(userId) {
    if (userSchedules.has(userId)) {
        userSchedules.get(userId).cancel();
        userSchedules.delete(userId);
        console.log(`[캘린더] 알림 스케줄 취소: ${userId}`);
        return true;
    }
    return false;
}

// 모든 스케줄 복원 (봇 재시작 시)
function restoreAllSchedules(calendarSettings, notificationCallback) {
    let restored = 0;

    for (const [userId, settings] of Object.entries(calendarSettings)) {
        if (settings.enabled && settings.notificationTime) {
            scheduleNotification(userId, settings.notificationTime, notificationCallback);
            restored++;
        }
    }

    console.log(`[캘린더] ${restored}개 알림 설정 복원됨`);
    return restored;
}

// 시간 형식 검증 (HH:mm)
function isValidTimeFormat(time) {
    if (!/^\d{2}:\d{2}$/.test(time)) return false;

    const [hour, minute] = time.split(':').map(Number);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

// 현재 등록된 스케줄 수 반환
function getScheduleCount() {
    return userSchedules.size;
}

module.exports = {
    scheduleNotification,
    cancelNotification,
    restoreAllSchedules,
    isValidTimeFormat,
    getScheduleCount
};
