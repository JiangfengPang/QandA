CREATE INDEX `User_role_isActive_idx`
  ON `User`(`role`, `isActive`);

CREATE INDEX `UserAnswer_createdAt_userId_isCorrect_durationSeconds_idx`
  ON `UserAnswer`(`createdAt`, `userId`, `isCorrect`, `durationSeconds`);
