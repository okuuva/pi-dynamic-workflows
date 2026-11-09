import assert from "node:assert/strict";
import test from "node:test";
import { createEffortState, effortDirective, isSubstantive, registerEffortCommand } from "../src/effort-command.js";
import { buildArmedWorkflowPrompt } from "../src/workflow-editor.js";

test("effortDirective shapes fan-out without inventing token budgets", () => {
  const auto = effortDirective("auto") ?? "";
  const high = effortDirective("high") ?? "";
  const ultra = effortDirective("ultra") ?? "";

  assert.equal(effortDirective("off"), undefined);
  assert.match(auto, /smallest useful workflow/);
  assert.match(auto, /set maxAgents to match the planned fan-out/);
  assert.doesNotMatch(auto, /reviewers|adversarial|verify|tokenBudget|big tier|thinking|exhaustive|thorough/);
  assert.match(high, /HIGH/);
  assert.match(ultra, /ULTRA/);
  assert.match(high, /maxAgents/);
  assert.match(ultra, /maxAgents/);
  assert.match(ultra, /judgePanel.*populated attempts.*dense input.*attempts\.length.*judges/i);
  assert.match(ultra, /completenessCheck.*1/i);
  assert.match(ultra, /execution retries.*do not add slots/i);
  assert.doesNotMatch(high, /tokenBudget/);
  assert.doesNotMatch(ultra, /tokenBudget/);
});

test("isSubstantive accepts real requests, rejects terse text and slash commands", () => {
  assert.equal(isSubstantive("audit the auth module for race conditions"), true);
  assert.equal(isSubstantive("ok"), false);
  assert.equal(isSubstantive("/workflows"), false);
  assert.equal(isSubstantive("    "), false);
});

test("buildArmedWorkflowPrompt appends the extra directive only when provided", () => {
  const base = buildArmedWorkflowPrompt("do X");
  assert.ok(!/ULTRA/.test(base), "no directive by default");
  assert.ok(base.startsWith("do X"));
  const ultra = buildArmedWorkflowPrompt("do X", { reason: "effort", extraDirective: effortDirective("ultra") });
  assert.match(ultra, /ULTRA/, "ultra directive appended");
  assert.ok(ultra.startsWith("do X"));
});

type CmdDef = { description: string; handler: (a: string, c: unknown) => Promise<void> };

function registerAndCapture(state: ReturnType<typeof createEffortState>, messages: string[] = []) {
  const cmds = new Map<string, CmdDef>();
  const pi = {
    registerCommand: (name: string, d: unknown) => cmds.set(name, d as CmdDef),
    sendMessage: (message: { content: string }) => messages.push(message.content),
  };
  registerEffortCommand(pi as never, state);
  return cmds;
}

test("registerEffortCommand: /effort toggles the shared state", async () => {
  const state = createEffortState();
  const effort = registerAndCapture(state).get("effort");
  assert.ok(effort, "/effort registered");
  assert.equal(state.level, "off");

  await effort?.handler("ultra", {});
  assert.equal(state.level, "ultra");
  await effort?.handler("high", {});
  assert.equal(state.level, "high");
  await effort?.handler(" AUTO ", {});
  assert.equal(state.level, "auto");
  await effort?.handler("off", {});
  assert.equal(state.level, "off");
  await effort?.handler("bogus", {});
  assert.equal(state.level, "off", "unknown arg leaves the level unchanged");
});

test("/effort auto reports balanced guidance and appears in help and status", async () => {
  const state = createEffortState();
  const messages: string[] = [];
  const effort = registerAndCapture(state, messages).get("effort");
  assert.ok(effort);
  assert.match(effort.description, /off \| auto \| high \| ultra/);
  await effort.handler("auto", {});
  assert.match(messages[0], /otherwise work directly/);
  assert.doesNotMatch(messages[0], /thorough|exhaustive/);
  await effort.handler("", {});
  assert.match(messages[1], /currently "auto".*off \| auto \| high \| ultra/);
});

test("registerEffortCommand: /ultracode turns ultra on, /ultracode off turns it off", async () => {
  const state = createEffortState();
  const ultracode = registerAndCapture(state).get("ultracode");
  assert.ok(ultracode, "/ultracode registered");

  await ultracode?.handler("", {});
  assert.equal(state.level, "ultra", "/ultracode (no arg) sets ultra");
  await ultracode?.handler("off", {});
  assert.equal(state.level, "off", "/ultracode off turns it off");
  await ultracode?.handler("anything", {});
  assert.equal(state.level, "ultra", "/ultracode <anything-but-off> sets ultra");
});
