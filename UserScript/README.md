# 🛠️ 유저스크립트 (UserScript)

스트리머 및 매니저를 위한 유저스크립트를 정리합니다.
Tampermonkey, Violentmonkey 등의 확장 프로그램을 통해 브라우저에서 스크립트를 실행할 수 있습니다.

## 📦 스크립트 목록

| 스크립트 이름 | 설명 | 버전 | 설치 / 업데이트 |
| :--- | :--- | :---: | :---: |
| **SOOP 별풍선 추출기** | SOOP VOD 채팅창에서 **별풍선 후원 내역**을 추출하여 CSV로 저장합니다. | v1.5 | [📥 설치하기](https://raw.githubusercontent.com/ssogari-dev/streamer-tools/main/UserScript/soop-vod-extractor.user.js) |
| **위플랩 룰렛 추출기** | 위플랩(Weflab)의 **룰렛 당첨 내역**을 전체 스캔하여 CSV로 통합 저장합니다. | v1.3 | [📥 설치하기](https://raw.githubusercontent.com/ssogari-dev/streamer-tools/main/UserScript/weflab-roulette.user.js) |

---

## 🚀 설치 방법 (How to Install)

이 스크립트를 사용하려면 브라우저에 유저스크립트 관리자(UserScript Manager)가 설치되어 있어야 합니다.

### 1단계: 유저스크립트 관리자 설치
사용 중인 환경에 맞는 확장 프로그램을 먼저 설치해주세요. (이미 설치되어 있다면 2단계로 건너뛰세요.)

#### 🖥️ PC (Chrome, Edge, Whale, Firefox 등)
호환성이 좋은 **Tampermonkey**를 추천합니다.
- **[Chrome / Edge / Whale / Brave](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)** : Tampermonkey 설치
- **[Firefox](https://addons.mozilla.org/ko/firefox/addon/tampermonkey/)** : Tampermonkey 설치
- **Open Source 선호 시**: [Violentmonkey](https://violentmonkey.github.io/)도 지원합니다.

#### 🛡️ AdGuard (Desktop / Android)
확장 프로그램 설치 없이 AdGuard 앱 자체 기능을 사용할 수도 있습니다.
1. AdGuard 설정 > 확장 프로그램 > **새 유저스크립트 추가**
2. 위 표의 `[📥 설치하기]` 링크 주소를 복사하여 붙여넣으세요.

---

### 2단계: 스크립트 설치
1. 위 **[📦 스크립트 목록]** 표에서 원하는 스크립트의 **[📥 설치하기]** 버튼을 클릭합니다.
2. 유저스크립트 관리자(Tampermonkey 등)의 설치 창이 뜨면 **"설치(Install)"** 또는 **"업데이트"** 버튼을 누릅니다.
3. 설치가 완료되면 해당 사이트(SOOP 또는 위플랩)에 접속하여 새로고침(F5) 하세요.

---

## 📖 사용 가이드

### 1. SOOP VOD 별풍선 내역 추출기
1. **SOOP(아프리카TV) VOD 다시보기** 페이지로 이동합니다.
2. 우측 하단에 생성된 보라색 **[별풍선 내역 추출]** 버튼을 클릭합니다.
3. 파일명을 입력하면 채팅 데이터를 분석하여 `.csv` 파일로 다운로드됩니다.
   - *주의: 영상 길이가 길수록 수집 시간이 소요됩니다.*

### 2. 위플랩 룰렛 내역 추출기
1. **위플랩(Weflab)** 사이트에 로그인합니다.
2. 스트리머 리모컨을 실행합니다.
3. 우측 하단에 **[🎲 룰렛 통합 추출]** 버튼이 활성화되었는지 확인합니다.
   - *버튼이 회색이면 다른 페이지를 클릭하거나 새로고침하세요.
4. 버튼을 클릭하면 과거 내역을 스캔합니다.
5. 수집이 완료되면 엑셀에서 열 수 있는 `.csv` 파일이 저장됩니다.

---

## ⚠️ 주의사항 (Disclaimer)
- 이 스크립트는 개인적인 편의를 위해 제작되었습니다.
- 과도한 요청(Abuse)을 방지하기 위해 딜레이가 설정되어 있으나, 무리한 사용으로 인한 불이익은 사용자 본인에게 있습니다.
- 사이트 구조가 변경될 경우 스크립트가 작동하지 않을 수 있습니다. (Issue 탭에 제보해주세요.)

---

### 📬 Contact / Issues
버그 제보나 기능 제안은 [Issues](https://github.com/ssogari-dev/streamer-tools/issues) 탭을 이용해주세요.
