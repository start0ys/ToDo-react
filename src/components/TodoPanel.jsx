import TodoInput from './TodoInput.jsx';
import TodoList from './TodoList.jsx';
import './todo.css';

function koDate(dayKey) {
  const [y, m, d] = dayKey.split('-');
  return `${y}년 ${m}월 ${d}일`;
}

export default function TodoPanel({ selectedDay, todos }) {
  const { todos: todoItems, finishes } = todos.getDayLists(selectedDay);

  return (
    <div id="todo-panel" className="card todo-card">
      <div className="todo-head">
        <div className="todo-date">{koDate(selectedDay)}</div>
        <TodoInput onAdd={(text) => todos.addTodo(selectedDay, text)} />
      </div>

      <div className="todo-lists">
        <TodoList
          title="To Do List"
          icon="✓"
          accent="var(--success)"
          type="todo"
          items={todoItems}
          onAction={todos.finishTodo}
          onEdit={todos.updateText}
          onReorder={todos.reorder}
        />
        <TodoList
          title="Finish List"
          icon="✕"
          accent="var(--danger)"
          type="finish"
          items={finishes}
          onAction={todos.deleteTodo}
          onEdit={todos.updateText}
          onReorder={todos.reorder}
        />
      </div>
    </div>
  );
}
