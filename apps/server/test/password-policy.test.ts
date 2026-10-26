import { expect, it } from "vitest";
import { validPassword } from "../src/auth/sessions";

it("accepts 6–128 characters and rejects passwords outside that range", () => {
  for (const password of ["abc123", "密".repeat(6), "a".repeat(128)]) {
    expect(() => validPassword(password)).not.toThrow();
  }
  for (const password of ["", "abc12", "😀".repeat(5), "a".repeat(129)]) {
    expect(() => validPassword(password)).toThrow("INVALID_PASSWORD_LENGTH");
  }
});
