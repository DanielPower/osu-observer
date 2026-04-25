import { Flex, Select as RadixSelect, Text } from "@radix-ui/themes";

export function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Flex direction="column" gap="2">
      <Text as="label" htmlFor={id} size="2" color="gray">
        {label}
      </Text>
      <RadixSelect.Root value={value} onValueChange={onChange}>
        <RadixSelect.Trigger id={id} variant="surface" color="violet" />
        <RadixSelect.Content variant="soft" color="violet">
          {options.map((opt) => (
            <RadixSelect.Item key={opt.value} value={opt.value}>
              {opt.label}
            </RadixSelect.Item>
          ))}
        </RadixSelect.Content>
      </RadixSelect.Root>
    </Flex>
  );
}
