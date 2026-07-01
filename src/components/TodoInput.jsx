import { useState } from 'react';

export default function TodoInput({ onAdd }) {
  const [value, setValue] = useState('');

  const submit = () => {
    if (!value.trim()) return;
    onAdd(value);
    setValue('');
  };

  return (
    <input
      className="todo-input"
      type="text"
      placeholder="📝 메모를 작성하고 Enter를 눌러주세요."
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyUp={(e) => {
        if (e.key === 'Enter') submit();
      }}
    />
  );
}
