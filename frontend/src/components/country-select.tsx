import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { COUNTRY_NAMES } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

interface CountrySelectProps {
  id?: string;
  value: string | undefined;
  onChange: (country: string) => void;
  /** Called when the list closes, so forms validate after the user has had a chance to pick. */
  onBlur?: () => void;
  invalid?: boolean;
  placeholder?: string;
}

const CountrySelect = ({
  id,
  value,
  onChange,
  onBlur,
  invalid = false,
  placeholder = "Select a country",
}: CountrySelectProps) => {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) onBlur?.();
  };

  const select = (country: string) => {
    onChange(country);
    handleOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className={cn(
            "h-11 sm:h-11 w-full justify-between rounded-xl border bg-[rgba(245,247,251,1)] px-3.5 py-2 text-base font-normal hover:bg-[rgba(245,247,251,1)]",
            value ? "text-dark-grey" : "text-[rgba(117,120,129,1)]",
            invalid ? "border-red" : "border-gray-300"
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRY_NAMES.map((name) => (
                <CommandItem key={name} value={name} onSelect={() => select(name)}>
                  {name}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === name ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CountrySelect;
