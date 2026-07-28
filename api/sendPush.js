import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !privateKey
  ) {
    throw new Error("Firebase 관리자 환경 변수가 설정되지 않았습니다.");
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    })
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      ok: false,
      message: "POST 요청만 사용할 수 있습니다."
    });
  }

  try {
    const authorization = request.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return response.status(401).json({
        ok: false,
        message: "로그인 정보가 없습니다."
      });
    }

    const idToken = authorization.substring(7);

    getAdminApp();

    const decodedToken = await getAuth().verifyIdToken(idToken);

    const signInProvider =
      decodedToken.firebase?.sign_in_provider || "";

    if (signInProvider === "anonymous") {
      return response.status(403).json({
        ok: false,
        message: "운영자 계정만 알림을 발송할 수 있습니다."
      });
    }

    const { reservationIds } = request.body || {};

    if (
      !Array.isArray(reservationIds) ||
      reservationIds.length === 0 ||
      reservationIds.length > 10
    ) {
      return response.status(400).json({
        ok: false,
        message: "호출할 예약 정보가 올바르지 않습니다."
      });
    }

    const firestore = getFirestore();
    const messages = [];
    const validReservations = [];

    for (const reservationId of reservationIds) {
      const reservationRef = firestore
        .collection("reservations")
        .doc(reservationId);

      const reservationSnapshot = await reservationRef.get();

      if (!reservationSnapshot.exists) continue;

      const reservation = reservationSnapshot.data();

      if (
        reservation.status !== "called" ||
        reservation.notificationEnabled !== true ||
        !reservation.fcmToken
      ) {
        continue;
      }

      messages.push({
        token: reservation.fcmToken,

        notification: {
          title: "2026 소래포구축제",
          body: `${reservation.boothName} ${reservation.ticketNumber}번 고객님, 지금 체험장으로 입장해주세요.`
        },

        data: {
          url: `/waiting.html?id=${reservationId}`,
          reservationId,
          boothId: reservation.boothId || ""
        },

        webpush: {
          notification: {
            tag: `sorae-call-${reservationId}`,
            renotify: true
          },

          fcmOptions: {
            link: `https://sorae-waiting.vercel.app/waiting.html?id=${reservationId}`
          }
        }
      });

      validReservations.push({
        id: reservationId,
        ref: reservationRef
      });
    }

    if (messages.length === 0) {
      return response.status(200).json({
        ok: true,
        sent: 0,
        message: "알림을 허용한 호출 대상자가 없습니다."
      });
    }

    const result = await getMessaging().sendEach(messages);

    const batch = firestore.batch();

    validReservations.forEach((reservation, index) => {
      const sendResult = result.responses[index];

      batch.update(reservation.ref, {
        pushSentAt: FieldValue.serverTimestamp(),
        pushSendSuccess: sendResult.success,
        pushErrorCode: sendResult.success
          ? null
          : sendResult.error?.code || "unknown"
      });
    });

    await batch.commit();

    return response.status(200).json({
      ok: true,
      sent: result.successCount,
      failed: result.failureCount
    });
  } catch (error) {
    console.error("푸시 발송 오류:", error);

    return response.status(500).json({
      ok: false,
      message: "푸시 알림 발송 중 오류가 발생했습니다."
    });
  }
}
