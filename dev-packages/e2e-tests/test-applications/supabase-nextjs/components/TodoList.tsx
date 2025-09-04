import { Database } from '@/lib/schema';
import { Session, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useEffect, useState } from 'react';

type Todos = Database['public']['Tables']['todos']['Row'];

export default function TodoList({ session }: { session: Session }) {
  const supabase = useSupabaseClient<Database>();
  const [todos, setTodos] = useState<Todos[]>([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [errorText, setErrorText] = useState('');

  const user = session.user;

  useEffect(() => {
    const fetchTodos = async () => {
      const { data: todos, error } = await supabase.from('todos').select('*').order('id', { ascending: true });

      if (error) console.log('error', error);
      else setTodos(todos);
    };

    fetchTodos();
  }, [supabase]);

  const addTodo = async (taskText: string) => {
    let task = taskText.trim();
    if (task.length) {
      const { data: todo, error } = await supabase.from('todos').insert({ task, user_id: user.id }).select().single();

      if (error) {
        setErrorText(error.message);
      } else {
        setTodos([...todos, todo]);
        setNewTaskText('');
      }
    }
  };

  const deleteTodo = async (id: number) => {
    try {
      await supabase.from('todos').delete().eq('id', id).throwOnError();
      setTodos(todos.filter(x => x.id != id));
    } catch (error) {
      console.log('error', error);
    }
  };

  return (
    <div>
      <h1>Todo List.</h1>
      <form
        onSubmit={e => {
          e.preventDefault();
          addTodo(newTaskText);
        }}
      >
        <input
          id="new-task-text"
          type="text"
          value={newTaskText}
          onChange={e => {
            setErrorText('');
            setNewTaskText(e.target.value);
          }}
        />
        <button id="add-task" type="submit">
          Add
        </button>
      </form>
      {!!errorText && <Alert text={errorText} />}
      <ul>
        {todos.map(todo => (
          <Todo key={todo.id} todo={todo} onDelete={() => deleteTodo(todo.id)} />
        ))}
      </ul>
    </div>
  );
}

const Todo = ({ todo, onDelete }: { todo: Todos; onDelete: () => void }) => {
  const supabase = useSupabaseClient<Database>();
  const [isCompleted, setIsCompleted] = useState(todo.is_complete);

  const toggle = async () => {
    try {
      const { data } = await supabase
        .from('todos')
        .update({ is_complete: !isCompleted })
        .eq('id', todo.id)
        .throwOnError()
        .select()
        .single();

      if (data) setIsCompleted(data.is_complete);
    } catch (error) {
      console.log('error', error);
    }
  };

  return (
    <li>
      <div>
        <div>
          <div>{todo.task}</div>
        </div>
        <div>
          <input
            className="cursor-pointer"
            onChange={e => toggle()}
            type="checkbox"
            checked={isCompleted ? true : false}
          />
        </div>
        <button
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
        ></button>
      </div>
    </li>
  );
};

const Alert = ({ text }: { text: string }) => <div>{text}</div>;
