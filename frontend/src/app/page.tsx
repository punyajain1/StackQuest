"use client";

import Link from "next/link";

export default function Home() {
  return (
    <>
      <header className="fixed top-0 left-0 w-full h-14 bg-[#f8f9f9] border-t-4 border-t-[var(--so-orange)] border-b border-b-[var(--so-border)] flex items-center justify-between px-4 sm:px-6 z-50">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-1.5 hover:bg-[#e3e6e8] px-2 py-1.5 rounded">
            <svg aria-hidden="true" className="native svg-icon iconLogoGlyphMd" width="32" height="37" viewBox="0 0 32 37">
              <path d="M26 33v-9h4v13H0V24h4v9h22Z" fill="#BCBBBB"/>
              <path d="m21.5 29.281-16-3.219.719-3.906 16.187 3.312-1 3.813Zm2.5-5.906-13.594-8.813 1.906-3.687 13.906 8.5-2.219 4Zm3.5-5.594L18.406 5.5l2.906-3.312 9.094 12.094-2.906 3.5Zm-20.281 9.406h16.281v-4H7.219v4Z" fill="#F48024"/>
            </svg>
            <span className="text-xl font-normal text-black font-sans -mt-1 tracking-tight">
              Stack<span className="font-bold">Quest</span>
            </span>
          </Link>
        </div>
        
        <div className="flex-1 max-w-2xl px-4 hidden md:block">
          <input 
            type="text" 
            placeholder="Search questions... (jk, there's no search here)" 
            className="w-full bg-white border border-[var(--so-border)] rounded-[3px] py-1.5 px-3 focus:outline-none focus:ring-4 focus:ring-[rgba(10,149,255,0.15)] focus:border-[var(--so-blue)] text-[13px]"
            disabled
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Link href="/auth/login" className="btn-so btn-so-secondary hidden sm:flex">Log in</Link>
          <Link href="/auth/signup" className="btn-so btn-so-primary">Sign up</Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 bg-white min-h-[calc(100vh-100px)]">
        <div className="max-w-2xl text-center">
          <div className="inline-block p-4 bg-[#fdf7e2] border border-[#f1e5bc] rounded text-[#816503] mb-8 text-[13px]">
            <strong className="font-bold">Notice:</strong> Welcome to StackQuest. The game where your random browser tabs finally pay off.
          </div>

          <h1 className="text-4xl md:text-5xl font-semibold text-[#232629] mb-6 leading-tight">
            Every developer has a tab open.<br/>
            Now it's a game.
          </h1>
          
          <p className="text-xl text-[#6a737c] mb-10 max-w-xl mx-auto">
            Test your knowledge of the world's largest developer community. Guess the upvotes, find the accepted answer, or judge the code.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/game/setup" className="btn-so btn-so-primary text-[15px] px-6 py-3">
              Play Game <span className="ml-1 opacity-80">(No account needed) </span>
            </Link>
            <Link href="/auth/guest" className="btn-so btn-so-outline text-[15px] px-6 py-3 bg-[var(--so-bg)]">
              Create Guest Account
            </Link>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl w-full">
          {[
            { tag: 'javascript', icon: '📝', desc: 'Judge JS madness' },
            { tag: 'python', icon: '🐍', desc: 'Guess the accepted answer' },
            { tag: 'reactjs', icon: '⚛️', desc: 'Navigate infinite hooks' }
          ].map(item => (
            <div key={item.tag} className="so-card flex flex-col gap-3">
              <div className="text-3xl">{item.icon}</div>
              <h3 className="font-medium text-[var(--so-blue)] cursor-pointer hover:text-[var(--so-blue-hover)]">
                {item.tag} challenges
              </h3>
              <p className="text-[13px] text-[#3b4045]">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>
      
      <footer className="bg-[#232629] text-[#babfc4] py-8 text-[13px] border-t border-t-[#222]">
        <div className="text-center">
          <p>StackQuest is not affiliated with Stack Overflow Inc.</p>
          <p className="mt-2 opacity-60">But it was inspired by 3am debugging sessions.</p>
        </div>
      </footer>
    </>
  );
}
