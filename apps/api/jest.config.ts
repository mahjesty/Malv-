import type { Config } from "jest";

const config: Config = {
  roots: ["<rootDir>/src"],
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }]
  },
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json"],
  clearMocks: true
};

export default config;
