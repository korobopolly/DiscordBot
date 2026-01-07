// Google OAuth2 인증 모듈
const { google } = require('googleapis');

// OAuth2 스코프 (캘린더 읽기 전용)
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

// OAuth2 클라이언트 생성
function createOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'urn:ietf:wg:oauth:2.0:oob'  // 수동 코드 입력 방식
    );
}

// 인증 URL 생성
function generateAuthUrl() {
    const oauth2Client = createOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',      // refresh_token 발급을 위해 필요
        scope: SCOPES,
        prompt: 'consent'            // 항상 동의 화면 표시 (refresh_token 보장)
    });
}

// 인증 코드로 토큰 교환
async function getTokenFromCode(code) {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

// 토큰으로 인증된 클라이언트 생성
function getAuthenticatedClient(tokens) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
}

// 토큰 갱신
async function refreshAccessToken(tokens) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);

    try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        return credentials;
    } catch (error) {
        // refresh_token 만료 또는 취소됨
        throw new Error('TOKEN_REFRESH_FAILED');
    }
}

// 토큰 만료 여부 확인
function isTokenExpired(tokens) {
    if (!tokens.expiry_date) return false;
    // 5분 여유를 두고 만료 체크
    return tokens.expiry_date < Date.now() + 5 * 60 * 1000;
}

module.exports = {
    createOAuth2Client,
    generateAuthUrl,
    getTokenFromCode,
    getAuthenticatedClient,
    refreshAccessToken,
    isTokenExpired
};
