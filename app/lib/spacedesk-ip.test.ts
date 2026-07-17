import { describe, it, expect } from "vitest";
import { buildFullIp, parseIpSuffix, isValidSuffix } from "./spacedesk-ip";

describe("buildFullIp", () => {
  it("prepends 192.168. to the suffix", () => {
    expect(buildFullIp("1.100")).toBe("192.168.1.100");
  });

  it("handles empty suffix", () => {
    expect(buildFullIp("")).toBe("192.168.");
  });
});

describe("parseIpSuffix", () => {
  it("strips the 192.168. prefix", () => {
    expect(parseIpSuffix("192.168.1.100")).toBe("1.100");
  });

  it("returns null for non-matching prefix", () => {
    expect(parseIpSuffix("10.0.0.1")).toBeNull();
  });

  it("returns empty string for bare prefix", () => {
    expect(parseIpSuffix("192.168.")).toBe("");
  });
});

describe("isValidSuffix", () => {
  it("accepts valid two-octet suffixes", () => {
    expect(isValidSuffix("1.100")).toBe(true);
    expect(isValidSuffix("0.1")).toBe(true);
    expect(isValidSuffix("255.255")).toBe(true);
  });

  it("rejects single octet", () => {
    expect(isValidSuffix("1")).toBe(false);
  });

  it("rejects three octets", () => {
    expect(isValidSuffix("1.2.3")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSuffix("")).toBe(false);
  });

  it("rejects octets above 255", () => {
    expect(isValidSuffix("256.1")).toBe(false);
    expect(isValidSuffix("1.999")).toBe(false);
  });

  it("rejects non-numeric octets", () => {
    expect(isValidSuffix("a.1")).toBe(false);
    expect(isValidSuffix("1.b")).toBe(false);
  });

  it("rejects octets with leading/trailing spaces in parts", () => {
    expect(isValidSuffix(" 1.1")).toBe(false);
    expect(isValidSuffix("1. 1")).toBe(false);
  });
});
