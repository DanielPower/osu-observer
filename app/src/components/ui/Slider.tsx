import { Flex, Slider as RadixSlider, Text } from "@radix-ui/themes";

export function Slider({
  id,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  displayValue,
  onInput,
}: {
  id?: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  displayValue?: string;
  onInput: (value: number) => void;
}) {
  return (
    <Flex direction="column" gap="2">
      <Flex align="center" justify="between">
        <Text as="label" htmlFor={id} size="2" color="gray">
          {label}
        </Text>
        {displayValue !== undefined && (
          <Text size="2" color="gray">
            {displayValue}
          </Text>
        )}
      </Flex>
      <RadixSlider
        id={id}
        size="2"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(values) => onInput(values[0])}
      />
    </Flex>
  );
}
