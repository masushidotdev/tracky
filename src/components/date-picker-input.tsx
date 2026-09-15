import * as React from 'react';
import { CalendarIcon } from 'lucide-react';

import { Calendar } from '@/components/ui/calendar';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

function formatDate(date: Date | undefined, locale: string) {
  if (!date) {
    return '';
  }

  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'numeric',
    year: 'numeric',
  });
}

function isValidDate(date: Date | undefined) {
  if (!date) {
    return false;
  }
  return !isNaN(date.getTime());
}

export function DatePickerInput(
  props: Omit<React.ComponentProps<'input'>, 'onChange' | 'value'> & {
    isInvalid?: boolean;
    errors?: Array<{ message?: string } | undefined>;
    value?: string;
    label?: string;
    locale?: string;
    onChange?: (date?: Date) => void;
    selectDateLabel?: string;
  },
) {
  const locale = props.locale ?? 'en-US';
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState<Date | undefined>(props.value ? new Date(props.value) : undefined);
  const [month, setMonth] = React.useState<Date | undefined>(date);
  const [_value, setValue] = React.useState(formatDate(date, locale));

  const _isInvalid = props.isInvalid ?? undefined;
  const label = props.label ?? 'Date';
  const selectDateLabel = props.selectDateLabel ?? 'Select date';

  return (
    <Field data-invalid={_isInvalid}>
      <FieldLabel htmlFor={props.name}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={props.id}
          name={props.name}
          value={_value}
          placeholder={props.placeholder}
          onChange={(e) => {
            const parsedDate = new Date(e.target.value);
            setValue(e.target.value);
            if (isValidDate(parsedDate)) {
              setDate(parsedDate);
              setMonth(parsedDate);
              props.onChange?.(parsedDate);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <InputGroupButton id="date-picker" variant="ghost" size="icon-xs" aria-label={selectDateLabel}>
                <CalendarIcon />
                <span className="sr-only">{selectDateLabel}</span>
              </InputGroupButton>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-0" align="end" alignOffset={-8} sideOffset={10}>
              <Calendar
                mode="single"
                selected={date}
                month={month}
                onMonthChange={setMonth}
                onSelect={(selectedDate) => {
                  setDate(selectedDate);
                  setValue(formatDate(selectedDate, locale));
                  props.onChange?.(selectedDate);
                  setOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      </InputGroup>
      {_isInvalid && <FieldError errors={props.errors} />}
    </Field>
  );
}
