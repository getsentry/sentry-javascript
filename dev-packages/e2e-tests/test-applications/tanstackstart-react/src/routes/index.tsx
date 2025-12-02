import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home
})

function Home() {
  return (
    <button
      type="button"
      onClick={() => {
        throw new Error("Sentry Test Error");
      }}
    >
      Break the world
    </button>
  )
}
