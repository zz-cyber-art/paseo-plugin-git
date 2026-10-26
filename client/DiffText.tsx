import type { PluginTheme } from "@getpaseo/plugin";
import { Platform, Text } from "react-native";

export const MONO_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  web: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  default: "monospace",
}) as string;

function diffLineColor(line: string, colors: PluginTheme["colors"]): string {
  if (line.startsWith("@@")) return colors.accent;
  if (line.startsWith("+") && !line.startsWith("+++")) return colors.statusSuccess;
  if (line.startsWith("-") && !line.startsWith("---")) return colors.statusDanger;
  if (line.startsWith("<<<<<<<") || line.startsWith(">>>>>>>")) return colors.statusDanger;
  if (line.startsWith("=======")) return colors.statusWarning;
  return colors.foregroundMuted;
}

export function DiffText({
  text,
  colors,
  fontSize,
  colored = true,
}: {
  text: string;
  colors: PluginTheme["colors"];
  fontSize: number;
  colored?: boolean;
}) {
  const lines = text.split(/\r?\n/);
  return (
    <>
      {lines.map((line, i) => (
        <Text
          key={i}
          style={{
            fontFamily: MONO_FONT,
            fontSize,
            color: colored ? diffLineColor(line, colors) : colors.foregroundMuted,
          }}
        >
          {line.length ? line : " "}
        </Text>
      ))}
    </>
  );
}
