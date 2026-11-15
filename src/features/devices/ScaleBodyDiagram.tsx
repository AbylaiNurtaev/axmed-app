import { G, Circle, Path, Rect, Svg } from "react-native-svg";
import { axColors } from "../../ui/tokens";

export type BodySegmentKey = "leftArm" | "rightArm" | "trunk" | "leftLeg" | "rightLeg";

export function ScaleBodyDiagram({ selected, onSelect }: { selected: BodySegmentKey; onSelect: (segment: BodySegmentKey) => void }) {
  const fill = (segment: BodySegmentKey) => selected === segment ? axColors.green : "#E8E8E8";
  const stroke = (segment: BodySegmentKey) => selected === segment ? "#111111" : "#C8C8C8";
  return <Svg accessibilityRole="image" accessibilityLabel="Схема сегментов тела" width="100%" height={310} viewBox="0 0 220 310">
    <Circle cx="110" cy="29" r="22" fill="#F0F0F0" stroke="#C8C8C8" strokeWidth="2" />
    <Path d="M92 57 C82 63 77 82 79 113 L85 173 C86 185 94 192 110 192 C126 192 134 185 135 173 L141 113 C143 82 138 63 128 57 C117 52 103 52 92 57 Z" fill={fill("trunk")} stroke={stroke("trunk")} strokeWidth="2.5" onPress={() => onSelect("trunk")} />
    <G onPress={() => onSelect("leftArm")}>
      <Path d="M82 69 C70 69 62 77 58 91 L39 159 C36 170 40 178 48 180 C56 181 61 175 64 165 L84 102 C88 89 91 73 82 69 Z" fill={fill("leftArm")} stroke={stroke("leftArm")} strokeWidth="2.5" />
      <Circle cx="46" cy="183" r="9" fill={fill("leftArm")} stroke={stroke("leftArm")} strokeWidth="2" />
    </G>
    <G onPress={() => onSelect("rightArm")}>
      <Path d="M138 69 C150 69 158 77 162 91 L181 159 C184 170 180 178 172 180 C164 181 159 175 156 165 L136 102 C132 89 129 73 138 69 Z" fill={fill("rightArm")} stroke={stroke("rightArm")} strokeWidth="2.5" />
      <Circle cx="174" cy="183" r="9" fill={fill("rightArm")} stroke={stroke("rightArm")} strokeWidth="2" />
    </G>
    <G onPress={() => onSelect("leftLeg")}>
      <Path d="M87 183 C83 206 82 230 78 265 C77 280 83 288 93 288 C102 288 106 281 106 267 L109 193 Z" fill={fill("leftLeg")} stroke={stroke("leftLeg")} strokeWidth="2.5" />
      <Rect x="76" y="281" width="31" height="13" rx="6" fill={fill("leftLeg")} stroke={stroke("leftLeg")} strokeWidth="2" />
    </G>
    <G onPress={() => onSelect("rightLeg")}>
      <Path d="M133 183 C137 206 138 230 142 265 C143 280 137 288 127 288 C118 288 114 281 114 267 L111 193 Z" fill={fill("rightLeg")} stroke={stroke("rightLeg")} strokeWidth="2.5" />
      <Rect x="113" y="281" width="31" height="13" rx="6" fill={fill("rightLeg")} stroke={stroke("rightLeg")} strokeWidth="2" />
    </G>
    <Circle cx="110" cy="142" r="7" fill={selected === "trunk" ? "#FFFFFF" : axColors.green} opacity="0.9" />
  </Svg>;
}
