const RESERVED_COMMANDS = ["panel", "config", "cmd"];

export function validateCommandName(name: string): { valid: boolean; error?: string } {
  // 1. 길이 및 문자 검증
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
    return {
      valid: false,
      error: "명령어 이름은 1-32자의 소문자, 숫자, 언더스코어(_), 하이픈(-)만 사용할 수 있습니다.",
    };
  }

  // 2. 예약어 검증
  if (RESERVED_COMMANDS.includes(name)) {
    return {
      valid: false,
      error: `'${name}'은(는) 시스템 예약 명령어입니다.`,
    };
  }

  return { valid: true };
}

export function validateResponse(response: string): { valid: boolean; error?: string } {
  if (response.length === 0) {
    return { valid: false, error: "응답 내용을 입력해주세요." };
  }

  if (response.length > 4000) {
    return { valid: false, error: "응답은 최대 4000자까지 입력 가능합니다." };
  }

  return { valid: true };
}

export function validateDescription(description: string | null): { valid: boolean; error?: string } {
  if (description === null || description === undefined) {
    return { valid: true }; // Optional field
  }

  if (description.length === 0) {
    return { valid: false, error: "미리보기 설명을 입력해주세요. (비워두려면 입력하지 마세요)" };
  }

  if (description.length > 100) {
    return { valid: false, error: "미리보기 설명은 최대 100자까지 입력 가능합니다." };
  }

  return { valid: true };
}
