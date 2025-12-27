export default function BackgroundPattern() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute top-1/4 left-1/5 w-64 h-64 rounded-full bg-gradient-to-r from-purple-500/10 to-cyan-500/10 blur-2xl"></div>
      <div className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-gradient-to-r from-pink-500/10 to-purple-500/10 blur-2xl"></div>
      <div className="absolute top-1/2 left-1/6 w-64 h-64 rounded-full bg-gradient-to-r from-purple-500/10 to-cyan-500/10 blur-2xl"></div>
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 rounded-full bg-gradient-to-r from-cyan-500/10 to-blue-500/10 blur-2xl"></div>
      <div className="absolute bottom-1/3 right-1/3 w-60 h-60 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 blur-2xl"></div>

      <div className="absolute top-1/5 right-1/5 w-56 h-56 rounded-full bg-gradient-to-r from-yellow-500/10 to-red-500/10 blur-2xl"></div>
      <div className="absolute top-2/3 left-1/4 w-72 h-72 rounded-full bg-gradient-to-r from-green-500/10 to-teal-500/10 blur-2xl"></div>
      <div className="absolute bottom-1/5 right-1/6 w-64 h-64 rounded-full bg-gradient-to-r from-indigo-500/10 to-purple-500/10 blur-2xl"></div>
      <div className="absolute top-1/3 left-1/2 w-52 h-52 rounded-full bg-gradient-to-r from-pink-500/10 to-orange-500/10 blur-2xl"></div>
      <div className="absolute bottom-2/5 left-1/5 w-68 h-68 rounded-full bg-gradient-to-r from-blue-500/10 to-cyan-500/10 blur-2xl"></div>
      <div className="absolute top-2/5 right-1/3 w-60 h-60 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 blur-2xl"></div>
      <div className="absolute bottom-1/6 left-2/5 w-76 h-76 rounded-full bg-gradient-to-r from-teal-500/10 to-green-500/10 blur-2xl"></div>
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle, #ffffff 1px, transparent 1px)`,
          backgroundSize: '30px 30px'
        }}
      ></div>
    </div>
  );
} 5