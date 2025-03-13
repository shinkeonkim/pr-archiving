# PR Archiving

> 특정 유저가 작성한 Repository의 Github PR 목록을 가져옵니다.
> 각 PR 상세 페이지 및 files 페이지의 스크린샷을 저장합니다.

- Load more… 를 통해 가려져 있는 코드 블럭을 열고 스크린샷을 제공합니다.
- Show resolved 를 통해 resolve된 comment를 열고 스크린샷을 제공합니다.

## Usage

1. npm package install
```
npm install
```

2. chrome 원격 디버깅 모드 실행 후, Github 계정 로그인

- Mac OS
```
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"
```

- Windows
```
"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-profile"
```

3. .env 파일 생성 (.env.sample 참고)

4. 실행

```
npm start
```
