// ============================================================
// _shared/fcm.ts — FCM v1 HTTP API 헬퍼
// ============================================================
// 용도: Firebase Cloud Messaging v1 HTTP API를 통한 푸시 알림 발송
// 규칙: STEP4_WORK_PLAN.md §3-2, §5-2 (Deno 런타임 주의)
//
// 설계:
//   - Firebase Admin SDK는 Deno 네이티브 미지원
//   - Google OAuth2 서비스 계정 JWT → Access Token 직접 발급
//   - FCM v1 HTTP API (https://fcm.googleapis.com/v1/projects/{id}/messages:send)
//   - 토큰별 개별 발송 (FCM v1 HTTP API는 멀티캐스트 미지원)
//   - 만료/무효 토큰 자동 정리 (UNREGISTERED, INVALID_ARGUMENT 등)
//
// 참조: MIGRATION_PLAN.md §7-2-6, §9-5 (FIREBASE_SERVICE_ACCOUNT_JSON Secret)
// ============================================================

// ─── 타입 정의 ────────────────────────────────────────────

/** Firebase 서비스 계정 JSON 구조 (필요 필드만) */
interface ServiceAccountKey {
  project_id: string
  private_key: string
  client_email: string
  token_uri: string
}

/** FCM 발송 결과 */
export interface FcmSendResult {
  sent_count: number
  failed_count: number
  cleaned_tokens: number
}

/** FCM 메시지 데이터 (딥링크용) */
export interface FcmMessageData {
  [key: string]: string
}

// ─── Base64URL 인코딩 ────────────────────────────────────

function base64UrlEncode(data: string): string {
  const encoded = btoa(data)
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ─── PEM → CryptoKey 변환 ────────────────────────────────

/**
 * PEM 형식 RSA 비밀키를 Web Crypto API CryptoKey로 변환
 */
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  const pemContents = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

// ─── Google OAuth2 Access Token ──────────────────────────

/** 캐시된 access token과 만료 시각 */
let cachedAccessToken: string | null = null
let tokenExpiresAt = 0

/**
 * Google OAuth2 서비스 계정으로 Access Token 발급
 *
 * JWT를 직접 생성하여 Google OAuth2 토큰 엔드포인트에 교환.
 * 토큰은 만료 5분 전까지 캐시하여 재사용.
 */
export async function getAccessToken(
  serviceAccount: ServiceAccountKey,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  // 캐시된 토큰이 유효하면 재사용 (만료 5분 전까지)
  if (cachedAccessToken && now < tokenExpiresAt - 300) {
    return cachedAccessToken
  }

  // JWT 헤더
  const header = base64UrlEncode(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  )

  // JWT 클레임
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: serviceAccount.token_uri,
      iat: now,
      exp: now + 3600, // 1시간
    }),
  )

  // JWT 서명
  const signatureInput = `${header}.${claimSet}`
  const privateKey = await importPrivateKey(serviceAccount.private_key)
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signatureInput),
  )
  const signature = arrayBufferToBase64Url(signatureBuffer)

  const jwt = `${signatureInput}.${signature}`

  // Google OAuth2 토큰 교환
  const tokenResponse = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text()
    throw new Error(
      `Google OAuth2 토큰 발급 실패 (${tokenResponse.status}): ${errorBody}`,
    )
  }

  const tokenData = await tokenResponse.json()
  cachedAccessToken = tokenData.access_token
  tokenExpiresAt = now + (tokenData.expires_in || 3600)

  return cachedAccessToken!
}

// ─── FCM v1 단건 발송 ────────────────────────────────────

/** FCM 발송 에러 중 토큰 무효로 판단하여 삭제해야 하는 코드 */
const INVALID_TOKEN_ERRORS = [
  'UNREGISTERED',      // 앱 삭제 또는 토큰 만료
  'INVALID_ARGUMENT',  // 잘못된 토큰 형식
  'NOT_FOUND',         // 토큰이 존재하지 않음
]

/**
 * FCM v1 HTTP API로 단건 메시지 발송
 *
 * @returns true = 발송 성공 | false = 발송 실패 | 'invalid' = 토큰 무효 (삭제 필요)
 */
async function sendSingleMessage(
  accessToken: string,
  projectId: string,
  fcmToken: string,
  title: string,
  body: string,
  data?: FcmMessageData,
): Promise<true | false | 'invalid'> {
  const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

  const message: Record<string, unknown> = {
    token: fcmToken,
    notification: {
      title,
      body,
    },
  }

  // 추가 데이터 (딥링크용)
  if (data && Object.keys(data).length > 0) {
    // FCM data 필드는 모든 값이 string이어야 함
    message.data = data
  }

  // Android 알림 채널 설정
  message.android = {
    notification: {
      channel_id: 'default',
      sound: 'default',
    },
  }

  // iOS(APNs) 설정
  message.apns = {
    payload: {
      aps: {
        sound: 'default',
        badge: 1,
      },
    },
  }

  try {
    const response = await fetch(FCM_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    })

    if (response.ok) {
      return true
    }

    // 에러 응답 분석
    const errorBody = await response.json().catch(() => ({}))
    const errorCode =
      errorBody?.error?.details?.[0]?.errorCode ||
      errorBody?.error?.status ||
      ''

    console.error(
      `[fcm] 발송 실패 (${response.status}): token=${fcmToken.substring(0, 20)}..., error=${errorCode}`,
    )

    // 토큰 무효 에러 → 삭제 대상
    if (INVALID_TOKEN_ERRORS.includes(errorCode)) {
      return 'invalid'
    }

    return false
  } catch (error) {
    console.error(`[fcm] 네트워크 오류: ${error}`)
    return false
  }
}

// ─── FCM 멀티캐스트 (다수 토큰 발송) ─────────────────────

/**
 * 여러 FCM 토큰에 동일 메시지를 발송하고, 무효 토큰 목록을 반환
 *
 * FCM v1 HTTP API는 멀티캐스트를 지원하지 않으므로
 * 토큰별 개별 발송 → 결과 집계 방식을 사용.
 *
 * @param tokens - FCM 토큰 배열
 * @returns 발송 결과 + 삭제 대상 토큰 배열
 */
export async function sendToTokens(
  serviceAccount: ServiceAccountKey,
  tokens: string[],
  title: string,
  body: string,
  data?: FcmMessageData,
): Promise<{ sentCount: number; failedCount: number; invalidTokens: string[] }> {
  if (tokens.length === 0) {
    return { sentCount: 0, failedCount: 0, invalidTokens: [] }
  }

  const accessToken = await getAccessToken(serviceAccount)
  const projectId = serviceAccount.project_id

  let sentCount = 0
  let failedCount = 0
  const invalidTokens: string[] = []

  // 병렬 발송 (최대 동시 발송 수 제한)
  const BATCH_SIZE = 10
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map((token) =>
        sendSingleMessage(accessToken, projectId, token, title, body, data),
      ),
    )

    for (let j = 0; j < results.length; j++) {
      const result = results[j]
      if (result.status === 'fulfilled') {
        if (result.value === true) {
          sentCount++
        } else if (result.value === 'invalid') {
          failedCount++
          invalidTokens.push(batch[j])
        } else {
          failedCount++
        }
      } else {
        failedCount++
      }
    }
  }

  return { sentCount, failedCount, invalidTokens }
}

// ─── 서비스 계정 파싱 ────────────────────────────────────

/**
 * FIREBASE_SERVICE_ACCOUNT_JSON 환경변수에서 서비스 계정 키 파싱
 */
export function getServiceAccount(): ServiceAccountKey {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 설정되지 않았습니다')
  }

  const parsed = JSON.parse(raw) as ServiceAccountKey
  if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 형식이 올바르지 않습니다')
  }

  return parsed
}
