CREATE INDEX `UserAnswer_userId_questionId_createdAt_idx`
  ON `UserAnswer`(`userId`, `questionId`, `createdAt`);

CREATE INDEX `EmailVerificationCode_email_purpose_consumedAt_createdAt_idx`
  ON `EmailVerificationCode`(`email`, `purpose`, `consumedAt`, `createdAt`);
