"use client";

import { useId, useRef, useState } from "react";
import styles from "./SearchableSelect.module.css";

export interface SearchableSelectOption {
  id: string;
  label: string;
}

interface SearchableSelectProps {
  name: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  disabled?: boolean;
}

// A combobox that never submits a value the user didn't explicitly click:
// it starts empty, filters its list as you type, and any edit to the text
// clears the selection until a real option is chosen. This replaces a bare
// <select>, which silently pre-highlights (and can submit) its first
// option - see the "Code style" note in CLAUDE.md.
export default function SearchableSelect({
  name,
  options,
  value,
  onChange,
  placeholder,
  disabled,
}: SearchableSelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const selected = options.find((o) => o.id === value);
  const displayValue = open ? query : (selected?.label ?? "");

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  function selectOption(option: SearchableSelectOption) {
    onChange(option.id);
    setQuery("");
    setOpen(false);
  }

  function handleInputChange(text: string) {
    setQuery(text);
    setOpen(true);
    setHighlighted(0);
    if (value) onChange("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlighted];
      if (option) selectOption(option);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        className={styles.input}
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Deferred so a click on an option (onMouseDown, below) registers
          // before the listbox unmounts.
          setTimeout(() => setOpen(false), 100);
        }}
      />
      <input type="hidden" name={name} value={value} />
      {open && (
        <ul id={listboxId} role="listbox" className={styles.listbox}>
          {filtered.length === 0 ? (
            <li className={styles.empty}>No matches</li>
          ) : (
            filtered.map((option, i) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === value}
                className={i === highlighted ? styles.optionHighlighted : styles.option}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(option);
                }}
                onMouseEnter={() => setHighlighted(i)}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
