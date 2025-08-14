import { JestConfigWithTsJest } from "ts-jest";

/** @type {import('ts-jest').JestConfigWithTsJest} */

const config: JestConfigWithTsJest = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  moduleFileExtensions: ["ts", "js", "json"],
};

export default config;
