interface MathProgramExitDescription {
  normal: boolean;
  detail: string;
  userMessage?: string;
}

const describeMathProgramExit = function (
  exitCode: number | null,
  exitSignal: string | null
): MathProgramExitDescription {
  if (exitCode === 0 && exitSignal === null)
    return {
      normal: true,
      detail: "exit code 0",
    };

  const detail =
    typeof exitSignal === "string"
      ? "signal " + exitSignal
      : exitCode !== null
      ? "exit code " + exitCode
      : "unknown exit status";
  const userMessage =
    exitSignal === "SIGKILL"
      ? "Macaulay2 was killed, probably because it exceeded the memory limit. Press Reset to start a fresh process."
      : typeof exitSignal === "string"
      ? "Macaulay2 exited unexpectedly with signal " +
        exitSignal +
        ". Press Reset to start a fresh process."
      : exitCode !== null
      ? "Macaulay2 exited unexpectedly with exit code " +
        exitCode +
        ". Press Reset to start a fresh process."
      : "Macaulay2 exited unexpectedly. Press Reset to start a fresh process.";
  return {
    normal: false,
    detail,
    userMessage,
  };
};

export { MathProgramExitDescription, describeMathProgramExit };
