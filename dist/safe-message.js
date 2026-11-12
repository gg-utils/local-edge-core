/**
 * @fileoverview Helpers that keep error and problem messages free of raw input.
 *
 * A message may name the field, the rule, the length of a value and an identifier that has
 * already passed its own shape check. It must never repeat a value that is unchecked or too long:
 * the value may be oversized, hold control characters or be a secret pasted into the wrong field.
 * Flow: caller passes the raw value (and, for identifiers, the shape it must have) -> helper
 * returns text that is safe to put in a message.
 *
 * This module is internal: it is not listed in the package `exports` map.
 *
 * @testing Node test runner (tsx): npm run test -- src/safe-message.unit.test.ts
 *
 * @see src/exposure-hostnames.ts - Problem messages for the `hostnames` backend.
 * @see src/exposure.ts - Manifest problem messages and the app label rule.
 * @documentation reviewed=2026-11-12 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */
/** Longest identifier a message will repeat. Longer text is described by its length only. */
export const LOCAL_EDGE_CORE_MESSAGE_NAME_MAX_LENGTH = 48;
/** A command-line option name such as `--method` or `-h`: what a message may repeat as an unknown option. */
export const LOCAL_EDGE_CORE_MESSAGE_OPTION_SHAPE = /^--?[A-Za-z0-9][A-Za-z0-9_-]*$/;
/** A plain word such as a command, method, backend or surface name. */
export const LOCAL_EDGE_CORE_MESSAGE_WORD_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** An app id: lowercase letters, digits and dashes, at most one DNS label (63 characters). */
export const LOCAL_EDGE_CORE_MESSAGE_APP_ID_SHAPE = /^[a-z0-9][a-z0-9-]*$/;
/** Longest app id a message will name (the DNS label limit). */
export const LOCAL_EDGE_CORE_MESSAGE_APP_ID_MAX_LENGTH = 63;
/**
 * Describes a value by its size alone, so a message can say something about it without repeating it.
 *
 * @param value - Any input.
 * @returns For a string, its length (`5 characters`); for anything else, `not a string`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_messageInputSize("abcde"); // "5 characters"
 * LocalEdgeCore_messageInputSize(undefined); // "not a string"
 * ```
 */
export function LocalEdgeCore_messageInputSize(value) {
    if (typeof value !== "string") {
        return "not a string";
    }
    return `${String(value.length)} character${value.length === 1 ? "" : "s"}`;
}
/**
 * Returns `value` when it is a short identifier of the given shape, otherwise a bracketed size
 * such as `<5000 characters>`. The value is only repeated after it passed the shape and length check.
 *
 * @param value - Any input.
 * @param shape - Pattern a repeatable value must match.
 * @param maxLength - Longest value to repeat; defaults to `LOCAL_EDGE_CORE_MESSAGE_NAME_MAX_LENGTH`.
 * @returns The value itself, or `<size>`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_messageName("--method", LOCAL_EDGE_CORE_MESSAGE_OPTION_SHAPE); // "--method"
 * LocalEdgeCore_messageName("--token=abc", LOCAL_EDGE_CORE_MESSAGE_OPTION_SHAPE); // "<11 characters>"
 * ```
 */
export function LocalEdgeCore_messageName(value, shape, maxLength = LOCAL_EDGE_CORE_MESSAGE_NAME_MAX_LENGTH) {
    if (typeof value === "string" && value.length > 0 && value.length <= maxLength && shape.test(value)) {
        return value;
    }
    return `<${LocalEdgeCore_messageInputSize(value)}>`;
}
/**
 * Like `LocalEdgeCore_messageName`, but the repeated value is wrapped in double quotes.
 *
 * @param value - Any input.
 * @param shape - Pattern a repeatable value must match.
 * @param maxLength - Longest value to repeat; defaults to `LOCAL_EDGE_CORE_MESSAGE_NAME_MAX_LENGTH`.
 * @returns `"value"` after it passed the shape and length check, otherwise `<size>`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_messageQuoted("route53", LOCAL_EDGE_CORE_MESSAGE_WORD_SHAPE); // "\"route53\""
 * ```
 */
export function LocalEdgeCore_messageQuoted(value, shape, maxLength = LOCAL_EDGE_CORE_MESSAGE_NAME_MAX_LENGTH) {
    const name = LocalEdgeCore_messageName(value, shape, maxLength);
    return name === value ? `"${name}"` : name;
}
/** A short configuration value such as `3000`, `yes` or `nginx-docker,caddy`. */
export const LOCAL_EDGE_CORE_MESSAGE_VALUE_SHAPE = /^[A-Za-z0-9._,:+-]+$/;
/** Longest configuration value a message will repeat. Longer text is described by its length only. */
export const LOCAL_EDGE_CORE_MESSAGE_VALUE_MAX_LENGTH = 24;
/**
 * Names a command-line option in a message: the option itself when it looks like one (`--method`),
 * otherwise `<N characters>`.
 *
 * @param value - The argument as typed.
 * @returns Text that is safe to put in a message.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_messageOption("--bogus"); // "--bogus"
 * LocalEdgeCore_messageOption("--token=hunter2"); // "<15 characters>"
 * ```
 */
export function LocalEdgeCore_messageOption(value) {
    return LocalEdgeCore_messageName(value, LOCAL_EDGE_CORE_MESSAGE_OPTION_SHAPE);
}
/**
 * Names a command, method or similar word in a message: the word itself when it is short and plain,
 * otherwise `<N characters>`.
 *
 * @param value - The word as given.
 * @returns Text that is safe to put in a message.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_messageWord("render"); // "render"
 * LocalEdgeCore_messageWord("x".repeat(500)); // "<500 characters>"
 * ```
 */
export function LocalEdgeCore_messageWord(value) {
    return LocalEdgeCore_messageName(value, LOCAL_EDGE_CORE_MESSAGE_WORD_SHAPE);
}
/** Most words `LocalEdgeCore_messageWords` repeats. */
const LOCAL_EDGE_CORE_MESSAGE_WORDS_MAX_COUNT = 5;
/**
 * Names a list of words in a message: at most five, each through `LocalEdgeCore_messageWord`, then
 * a count of the rest.
 *
 * @param values - The arguments as given.
 * @returns Text that is safe to put in a message.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_messageWords(["a", "b"]); // "a b"
 * LocalEdgeCore_messageWords(["a", "b", "c", "d", "e", "f", "g"]); // "a b c d e (and 2 more)"
 * ```
 */
export function LocalEdgeCore_messageWords(values) {
    const shown = values.slice(0, LOCAL_EDGE_CORE_MESSAGE_WORDS_MAX_COUNT).map((value) => LocalEdgeCore_messageWord(value));
    const rest = values.length - shown.length;
    return rest > 0 ? `${shown.join(" ")} (and ${String(rest)} more)` : shown.join(" ");
}
/**
 * Names a short configuration value in a message (a number, a flag, a method list): the value
 * itself when it is at most 24 plain characters, otherwise `<N characters>`.
 *
 * @param value - The raw environment or option value.
 * @returns Text that is safe to put in a message.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_messageValue("abc"); // "abc"
 * LocalEdgeCore_messageValue("p".repeat(80)); // "<80 characters>"
 * ```
 */
export function LocalEdgeCore_messageValue(value) {
    return LocalEdgeCore_messageName(value, LOCAL_EDGE_CORE_MESSAGE_VALUE_SHAPE, LOCAL_EDGE_CORE_MESSAGE_VALUE_MAX_LENGTH);
}
/**
 * Returns a number for a message, or `<not a number>` for any other input. A number is bounded
 * text; a value that only claims to be one (a string, an object) is never repeated.
 *
 * @param value - Any input, usually a port.
 * @returns `String(value)` for a number, otherwise `<not a number>`.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_messageNumber(70000); // "70000"
 * LocalEdgeCore_messageNumber("70000 and a long secret"); // "<not a number>"
 * ```
 */
export function LocalEdgeCore_messageNumber(value) {
    return typeof value === "number" ? String(value) : "<not a number>";
}
/**
 * Names an app in a message. The id is repeated only when it passes the app id shape and is at
 * most one DNS label long; otherwise the app is named by its position (`apps[2]`) or, with no
 * position, by the id's length.
 *
 * @param id - The app id, validated or not.
 * @param index - Position of the app in the manifest, when known.
 * @returns A label that is safe to put in a message.
 *
 * @example
 * ```typescript
 * LocalEdgeCore_messageAppLabel("web", 0); // "web"
 * LocalEdgeCore_messageAppLabel("Web;{}", 3); // "apps[3]"
 * LocalEdgeCore_messageAppLabel("Web;{}"); // "<app id, 6 characters>"
 * ```
 */
export function LocalEdgeCore_messageAppLabel(id, index) {
    if (typeof id === "string" &&
        id.length > 0 &&
        id.length <= LOCAL_EDGE_CORE_MESSAGE_APP_ID_MAX_LENGTH &&
        LOCAL_EDGE_CORE_MESSAGE_APP_ID_SHAPE.test(id)) {
        return id;
    }
    return index === undefined ? `<app id, ${LocalEdgeCore_messageInputSize(id)}>` : `apps[${String(index)}]`;
}
