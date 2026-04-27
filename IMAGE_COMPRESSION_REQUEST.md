# 이미지/동영상 업로드 압축 적용 요청서

## 배경

현재 앱에서 촬영한 원본 이미지(3~10MB)를 그대로 Supabase Storage에 업로드하고 있어 사진 조회 속도가 느립니다. 업로드 시점에 클라이언트에서 압축 후 올리도록 수정해 주세요.

## 변경 범위

- **업로드 직전에 이미지/동영상 압축 단계만 추가**
- Storage 경로, DB 저장 형식(풀 URL), URL 구조 등은 **현재와 동일하게 유지**
- 서버 측 수정 없음

## 사용 라이브러리 (React Native)

| 용도 | 라이브러리 | 비고 |
|------|-----------|------|
| 이미지 압축 + 리사이즈 | `react-native-compressor` | 이미지/동영상 통합 |
| 동영상 압축 | `react-native-compressor` | 위와 동일 |
| 동영상 썸네일 추출 | `react-native-create-thumbnail` | 첫 프레임 JPEG |

---

## 1. 이미지 압축 스펙

### 1-1. 버킷별 압축 기준

| 대상 버킷 | 장변 최대 | JPEG quality | 비고 |
|-----------|----------|-------------|------|
| `profile-images` | 1920px | 85 | 프로필 사진 |
| `kindergarten-images` | 1920px | 85 | 유치원 사진 |
| `pet-images` | 1920px | 85 | 반려동물 사진 |
| `review-images` | 1920px | 85 | 후기 이미지 |
| `chat-files` (이미지) | 1920px | 80 | 채팅 첨부 이미지 |
| `address-docs` | 2560px | 90 | 주소인증 서류 (글씨 판독 필요하므로 높은 품질) |

### 1-2. 이미지 압축 규칙

- 장변 기준 리사이즈 (비율 유지, 장변이 기준 이하면 리사이즈 생략하고 quality 압축만 적용)
- 출력 포맷: JPEG 고정 (PNG/HEIC 입력이어도 JPEG으로 변환)
- EXIF 방향 정보 적용 후 EXIF 메타데이터 제거 (위치정보 등 개인정보 보호)

### 1-3. 이미지 압축 적용 예시 (react-native-compressor)

```javascript
import { Image } from 'react-native-compressor';

// 일반 사진 (프로필/유치원/반려동물/후기)
const compressed = await Image.compress(originalUri, {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
  input: 'uri',
  output: 'jpg',
  returnableOutputType: 'uri',
});

// 주소인증 서류 (글씨 판독 필요 — 높은 품질)
const compressedDoc = await Image.compress(originalUri, {
  maxWidth: 2560,
  maxHeight: 2560,
  quality: 0.9,
  input: 'uri',
  output: 'jpg',
  returnableOutputType: 'uri',
});

// 채팅 이미지
const compressedChat = await Image.compress(originalUri, {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.8,
  input: 'uri',
  output: 'jpg',
  returnableOutputType: 'uri',
});

// 압축 후 기존 업로드 로직에 compressed URI를 전달
await uploadToSupabase(compressed); // 기존 함수 그대로 사용
```

---

## 2. 동영상 압축 스펙 (chat-files 전용)

### 2-1. 동영상 압축 기준

| 항목 | 값 |
|------|-----|
| 해상도 | 720p (1280x720) |
| 코덱 | H.264 |
| 비트레이트 | 최대 3Mbps |
| 오디오 | AAC 128kbps |
| 용량 제한 | 압축 후 50MB 이하 |
| 길이 제한 | 3분 이내 (압축 전 기준으로 체크) |

### 2-2. 동영상 썸네일

- 첫 프레임(또는 1초 지점)을 JPEG으로 추출
- 장변 720px, quality 80
- 채팅창에서는 썸네일만 표시, 탭 시 동영상 재생

### 2-3. 동영상 압축 적용 예시

```javascript
import { Video } from 'react-native-compressor';
import { createThumbnail } from 'react-native-create-thumbnail';

// 길이 체크 (3분 = 180초 초과 시 차단)
if (videoDuration > 180) {
  // 업로드 차단 + 안내 팝업 표시 (아래 3-2 참조)
  return;
}

// 동영상 압축
const compressedVideo = await Video.compress(originalVideoUri, {
  compressionMethod: 'auto',
  maxSize: 1280,
  bitrate: 3000000,
});

// 압축 후 용량 체크 (50MB 초과 시 차단)
const fileInfo = await getFileSize(compressedVideo);
if (fileInfo.size > 50 * 1024 * 1024) {
  // 업로드 차단 + 안내 팝업 표시 (아래 3-2 참조)
  return;
}

// 썸네일 추출
const thumbnail = await createThumbnail({
  url: originalVideoUri,
  timeStamp: 1000,
  format: 'jpeg',
  quality: 80,
});

// 썸네일 이미지도 리사이즈
const compressedThumb = await Image.compress(thumbnail.path, {
  maxWidth: 720,
  maxHeight: 720,
  quality: 0.8,
  output: 'jpg',
});

// 기존 업로드 로직으로 전달
await uploadVideoToSupabase(compressedVideo);
await uploadThumbnailToSupabase(compressedThumb);
```

---

## 3. 업로드 제한 초과 시 안내 팝업 (UI 요구사항)

### 3-1. 팝업 디자인

기존 앱에 있는 "첨부할 수 없는 파일입니다" 팝업과 동일한 스타일로 구현해 주세요.

```
┌─────────────────────────────────┐
│                                 │
│    첨부할 수 없는 파일입니다       │
│                                 │
│  사진/영상은 아래 규격내의 파일만   │
│  첨부가능합니다.                  │
│                                 │
│    - 사진 : 10MB 이내            │
│    - 동영상 : 3분 이내 + 50MB 이내│
│                                 │
│           [ 닫기 ]               │
│                                 │
└─────────────────────────────────┘
```

### 3-2. 팝업 표시 조건

| 조건 | 팝업 표시 여부 | 동작 |
|------|:---:|------|
| 이미지 원본 10MB 초과 | 표시 | 업로드 차단, 팝업 표시 |
| 동영상 길이 3분 초과 | 표시 | 업로드 차단, 팝업 표시 |
| 동영상 압축 후 50MB 초과 | 표시 | 업로드 차단, 팝업 표시 |
| 이미지 원본 10MB 이하 | 미표시 | 정상 압축 후 업로드 |
| 동영상 3분 이내 + 압축 후 50MB 이내 | 미표시 | 정상 압축 후 업로드 |

### 3-3. 참고: 이미지 10MB 제한은 압축 전 기준

이미지는 압축하면 거의 대부분 1MB 이하가 되므로, 10MB 제한은 **압축 전 원본 기준**으로 체크합니다. 10MB 이하인 원본이 들어오면 압축 처리 후 업로드하면 됩니다.

---

## 4. 업로드 흐름 (수정 후)

```
[사용자 사진/동영상 선택 또는 촬영]
    │
    ▼
[용량/길이 사전 체크]
    │── 이미지 10MB 초과 ──→ 안내 팝업 표시, 업로드 중단
    │── 동영상 3분 초과  ──→ 안내 팝업 표시, 업로드 중단
    │
    ▼ (통과)
[압축 처리 + 로딩 표시]
    │── 이미지: 리사이즈 + JPEG 압축
    │── 동영상: 해상도 + 비트레이트 압축 + 썸네일 추출
    │
    ▼
[압축 후 용량 체크 — 동영상만]
    │── 50MB 초과 ──→ 안내 팝업 표시, 업로드 중단
    │
    ▼ (통과)
[기존 업로드 로직 그대로 실행] ← 변경 없음
    │
    ▼
[기존 DB 저장 로직 그대로 실행] ← 변경 없음 (풀 URL 저장 유지)
```

---

## 5. 기타 요청사항

- 압축 처리 중 **로딩 인디케이터 표시** (특히 동영상은 수 초 소요될 수 있음)
- 압축 실패 시 **원본으로 업로드** (fallback 처리)
- 모든 이미지 업로드 지점(프로필, 유치원, 반려동물, 후기, 채팅, 주소인증)에 **빠짐없이 적용**
