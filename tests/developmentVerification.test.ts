import assert from "node:assert/strict";
import test from "node:test";
import { developmentVerificationOrigin } from "../app/lib/developmentVerification";

test("development verifier only accepts explicit loopback origins", () => {
  assert.equal(
    developmentVerificationOrigin("http://localhost:3000"),
    "http://localhost:3000",
  );
  assert.equal(
    developmentVerificationOrigin("http://127.0.0.1:3001/"),
    "http://127.0.0.1:3001",
  );
  assert.equal(
    developmentVerificationOrigin("http://[::1]:3000"),
    "http://[::1]:3000",
  );
  for (const value of [
    "https://example.com",
    "http://localhost.example.com",
    "http://localhost@evil.example",
    "http://user:password@localhost",
    "http://localhost/path",
    "http://localhost?token=secret",
    "file:///tmp/site",
    "http://localhost#fragment",
  ]) {
    assert.throws(() => developmentVerificationOrigin(value));
  }
});
