# Biz Vocab Quest

갤럭시(Android)용 비즈니스 영어 단어 학습 앱. Kotlin + Jetpack Compose 단일 모듈, 서버·로그인·결제 없음.

---

## 1. 프로젝트 구조

```
BizVocabQuest/
├── settings.gradle.kts
├── build.gradle.kts                 AGP 8.7.2 / Kotlin 2.0.21
├── gradle.properties
├── gradle/wrapper/gradle-wrapper.properties
└── app/
    ├── build.gradle.kts             compileSdk 35 / minSdk 24
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml  세로 고정 + TTS queries
        │   ├── res/values/          strings.xml, themes.xml
        │   └── java/com/example/bizvocab/
        │       ├── MainActivity.kt          진입점 + 화면 라우팅
        │       ├── data/
        │       │   ├── Word.kt              데이터 모델
        │       │   ├── WordData.kt          샘플 32단어
        │       │   └── ProgressStore.kt     DataStore + Leitner 박스
        │       ├── quiz/
        │       │   ├── QuizEngine.kt        문제 생성·오답 해설·점수
        │       │   └── QuizViewModel.kt     세션 상태
        │       ├── speech/TtsController.kt  TTS 래퍼
        │       └── ui/
        │           ├── Common.kt            발음 버튼, IPA 칩, 진행 헤더
        │           ├── HomeScreen.kt
        │           ├── StudyScreen.kt       새 단어 카드
        │           ├── QuizScreen.kt        문제 + 정답/오답 피드백
        │           ├── ResultScreen.kt
        │           └── theme/Theme.kt
        └── test/java/com/example/bizvocab/WordDataTest.kt
```

## 2. 실행 방법

1. Android Studio(Ladybug 이상) → **Open** → `BizVocabQuest` 폴더 선택.
2. Gradle 래퍼 JAR은 바이너리라 이 저장소에 없다. 아래 중 하나로 채운다.
   - Android Studio가 열 때 자동 생성하도록 둔다(대개 자동 처리됨), 또는
   - 로컬에 Gradle이 있으면 프로젝트 루트에서 `gradle wrapper --gradle-version 8.9`
3. 갤럭시 기기를 USB로 연결하고 **개발자 옵션 → USB 디버깅** 활성화.
4. Run ▶ 또는 `./gradlew installDebug`
5. 단위 테스트: `./gradlew test`

버전 충돌이 나면 AGP/Kotlin만 Android Studio의 업그레이드 어시스턴트로 올린다. Compose 컴파일러는 Kotlin 2.0부터 `org.jetbrains.kotlin.plugin.compose` 플러그인이 담당하므로 **Kotlin 버전과 이 플러그인 버전을 반드시 같게** 유지해야 한다.

앱 아이콘 리소스는 넣지 않았다(시스템 기본 아이콘 사용). 출시할 게 아니면 그대로 둬도 된다.

## 3. 학습 흐름

```
홈 → (새 단어가 있으면) 단어 카드 → 퀴즈 10문항 → 즉시 피드백 → 결과
                                        ↑                    │
                                        └─ 틀린 문제 재출제 ──┘
```

- 문제 형식이 숙련도에 따라 올라간다: **뜻 고르기 → 영어로 떠올리기 → 문장 빈칸**
- 정답 시 Leitner 박스 +1(최대 5), 복습 간격 10분 → 1일 → 3일 → 7일
- 오답 시 박스 1로 강등 + 세션 안에서 즉시 재출제(단, 재도전 문제는 점수 없음)
- 점수 = 10점 + 연속 정답 보너스(최대 +10). 콤보는 오답 시 0으로 초기화

## 4. 데이터 구조

```kotlin
data class Word(
    val id: String,
    val term: String,
    val ipa: String,          // General American
    val meaningKo: String,
    val pos: Pos,
    val example: String,      // term이 기본형 그대로 등장해야 함(빈칸 문제용)
    val exampleKo: String,
    val confusions: List<Confusion>
)

data class Confusion(val distractorId: String, val note: String)
```

`confusions`가 이 앱의 핵심 자산이다. 오답 보기를 무작위로 뽑으면 문제가 너무 쉬워져서 "찍어서 맞히고 못 쓰는" 상태가 된다. 그래서 각 단어마다 **실제로 헷갈리는 짝**(mitigate↔escalate, retention↔attrition, invoice↔receipt 등)을 사람이 직접 지정하고, 그 짝을 골랐을 때 나올 해설도 같이 집필해 뒀다.

**단어를 추가할 때 지켜야 할 것**
- IPA는 지어내지 말고 Merriam-Webster 또는 Wiktionary의 General American 표기를 그대로 옮긴다.
- 예문에는 단어를 기본형 그대로 넣는다(활용형을 쓰면 빈칸 문제가 깨진다).
- `confusions`를 최소 2개 채운다.
- 추가 후 반드시 `./gradlew test` 실행. `WordDataTest`가 id 참조 오류, IPA 형식, 빈칸 정답 노출, 보기 개수를 전부 검사한다.

## 5. TTS 관련 실무 주의사항

`TtsController`가 다음 세 가지를 처리한다. 이걸 안 하면 갤럭시에서 특히 자주 깨진다.

| 문제 | 증상 | 처리 |
|---|---|---|
| 초기화가 비동기 | 첫 카드에서 소리가 안 남 | READY 전 요청을 `pending`에 보관 후 재생 |
| 삼성 TTS 기본 로케일이 한국어 | 영어 단어를 한국어 발음으로 읽음 | `setLanguage(Locale.US)` 명시, 실패 시 UK→AU 순 폴백 |
| 영어 음성 데이터 미설치 | `LANG_MISSING_DATA` | 크래시 대신 안내 배너 + `ACTION_INSTALL_TTS_DATA` 인텐트 |

Android 11 이상의 패키지 가시성 때문에 매니페스트의 `<queries><intent><action android:name="android.intent.action.TTS_SERVICE"/></intent></queries>`가 필요하다. 이게 없으면 일부 기기에서 엔진을 찾지 못한다.

TTS를 못 쓰는 상황에서도 앱은 멈추지 않고 학습이 계속된다.

## 6. 의도적으로 넣지 않은 것

- 로그인/서버/결제/랭킹: 요청 범위 밖이고, 로컬 DataStore로 충분하다.
- Material You 동적 색상: 사용자 배경화면에 따라 정답 초록/오답 빨강이 변색되면 피드백 신호가 망가진다.
- 하트·목숨·일일 연속 접속 같은 강한 게이미피케이션: 학습보다 접속 유지가 목표가 되면 오답을 회피하게 된다. 점수·콤보·진행도까지만 넣었다.

## 7. 알려진 한계

- 빈칸 문제에서 품사가 다른 보기는 문법적으로 어색해 소거하기 쉽다. 보기를 같은 품사로만 채우려면 단어 수를 품사별로 더 늘려야 한다.
- 32단어는 데모 규모다. 200단어를 넘기면 `WordData.kt` 하드코딩 대신 `assets/words.json` + kotlinx.serialization으로 옮기는 편이 낫다.
- 오답 해설은 전부 수기 집필이라 단어 추가 비용이 선형으로 증가한다. 이건 설계상 감수한 비용이다.
- 발음 평가(사용자 발화 채점)는 없다. TTS는 듣기 전용이다.
