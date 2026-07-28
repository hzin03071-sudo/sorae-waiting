소래포구축제 전자 웨이팅 시스템

1. assets/firebase-config.js 파일에 Firebase SDK 설정값을 붙여넣습니다.
2. Firebase Authentication에서 운영자 이메일 계정을 생성합니다.
3. Firestore Rules 탭에 firestore.rules 내용을 붙여넣고 게시합니다.
4. Vercel에 이 폴더 전체를 업로드합니다.
5. /login.html 로 접속해 운영자 로그인 후 '체험 4종 초기 생성'을 누릅니다.
6. 방문객 주소는 /index.html, 운영자 주소는 /admin.html 입니다.

중요:
- 실제 행사 전 다수 기기 동시 접속, 통신 장애, 개인정보 보유기간, 현장 취소 처리,
  브라우저 종료 후 재접속, 운영자 권한을 반드시 사전 테스트해야 합니다.
- 이 버전은 현장 파일럿용 기본판입니다. SMS/카카오 알림은 별도 유료 연동이 필요합니다.
