export default function PageLoader({ message = 'Loading...', fullScreen = false }) {
  const shell = fullScreen
    ? 'flex items-center justify-center min-h-screen bg-gray-50'
    : 'flex items-center justify-center min-h-[60vh]';

  return (
    <div className={shell}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-[3px] border-[#1B6B6B] border-t-transparent animate-spin" />
        <p className="text-sm text-gray-400">{message}</p>
      </div>
    </div>
  );
}
