import React from 'react';

export interface WebsiteConfig {
  template: 'portfolio' | 'landing' | 'blog';
  theme: 'light' | 'dark' | 'colorful';
  title: string;
  description: string;
  imageUrl: string;
}

export const defaultWebsiteConfig: WebsiteConfig = {
  template: 'portfolio',
  theme: 'dark',
  title: 'My Awesome Site',
  description: 'Welcome to my corner of the web. I am building this site with Nexus AI.',
  imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&w=600&q=80',
};

interface WebsiteBuilderProps {
  config: WebsiteConfig;
  onChange: (config: WebsiteConfig) => void;
}

export const WebsiteBuilder: React.FC<WebsiteBuilderProps> = ({ config, onChange }) => {
  const handleChange = (key: keyof WebsiteConfig, value: string) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Editor Panel */}
      <div className="p-4 bg-slate-800/80 border-b border-white/10 grid grid-cols-2 gap-3 shrink-0">
        <div>
          <label className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Template</label>
          <select 
            className="w-full bg-slate-900 border border-slate-700 hover:border-emerald-500/50 rounded-lg p-2 text-xs text-white transition-colors"
            value={config.template}
            onChange={(e) => handleChange('template', e.target.value)}
          >
            <option value="portfolio">Portfolio</option>
            <option value="landing">Landing Page</option>
            <option value="blog">Blog</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Theme</label>
          <select 
            className="w-full bg-slate-900 border border-slate-700 hover:border-emerald-500/50 rounded-lg p-2 text-xs text-white transition-colors"
            value={config.theme}
            onChange={(e) => handleChange('theme', e.target.value)}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="colorful">Colorful</option>
          </select>
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Title</label>
          <input 
            type="text" 
            className="w-full bg-slate-900 border border-slate-700 hover:border-emerald-500/50 rounded-lg p-2 text-xs text-white transition-colors"
            value={config.title}
            onChange={(e) => handleChange('title', e.target.value)}
          />
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Header Image URL</label>
          <input 
            type="text" 
            className="w-full bg-slate-900 border border-slate-700 hover:border-emerald-500/50 rounded-lg p-2 text-xs text-white transition-colors"
            value={config.imageUrl}
            onChange={(e) => handleChange('imageUrl', e.target.value)}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[9px] text-slate-400 uppercase font-bold mb-1">Description / Content</label>
          <textarea 
            className="w-full bg-slate-900 border border-slate-700 hover:border-emerald-500/50 rounded-lg p-2 text-xs text-white transition-colors custom-scrollbar"
            value={config.description}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={2}
          />
        </div>
      </div>

      {/* Live Preview Container */}
      <div className="flex-1 overflow-y-auto bg-black p-4 md:p-6 custom-scrollbar relative">
        <div className="absolute top-4 right-6 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 z-10">
          <span className="text-[10px] text-white font-mono uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Live Preview
          </span>
        </div>

        <div className={`min-h-full rounded-2xl overflow-hidden shadow-2xl transition-all duration-700 flex flex-col border border-white/5 ${
          config.theme === 'light' ? 'bg-slate-50 text-slate-900' :
          config.theme === 'colorful' ? 'bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-white' :
          'bg-slate-950 text-slate-100 placeholder-white'
        }`}>
          {/* Main Content Area based on template */}
          <main className="flex-1 flex flex-col">
            {config.template === 'portfolio' && (
              <div className="flex-1 flex flex-col">
                <header className={`p-8 md:p-12 text-center ${config.theme === 'light' ? 'bg-white border-b border-slate-200' : 'bg-black/20 border-b border-white/10'}`}>
                  {config.imageUrl && (
                    <img src={config.imageUrl} alt="Profile" className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover shadow-2xl border-4 border-white/20 mx-auto mb-6" />
                  )}
                  <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-2">{config.title || 'Your Name'}</h1>
                  <p className="text-sm md:text-base font-medium opacity-70 uppercase tracking-widest">Personal Portfolio</p>
                </header>
                <div className="p-8 md:p-12 max-w-3xl mx-auto w-full flex-1">
                  <h2 className="text-xl font-bold border-b border-current pb-2 mb-6 inline-block opacity-80">About Me</h2>
                  <p className="opacity-90 leading-relaxed text-base md:text-lg">{config.description || 'Add your bio or work experience here.'}</p>
                </div>
              </div>
            )}
            
            {config.template === 'landing' && (
              <div className="flex-1 flex flex-col justify-center items-center text-center p-8 md:p-12 relative overflow-hidden">
                {config.imageUrl && (
                  <div className="absolute inset-0 z-0">
                    <img src={config.imageUrl} alt="Background" className="w-full h-full object-cover opacity-20" />
                    <div className="absolute inset-0 bg-gradient-to-t from-current to-transparent opacity-50 mix-blend-multiply"></div>
                  </div>
                )}
                <div className="relative z-10 max-w-4xl mx-auto w-full pt-10">
                  <span className="px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-current text-white mix-blend-difference mb-6 inline-block">New Arrival</span>
                  <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-6">{config.title || 'Product Name'}</h1>
                  <p className="text-xl md:text-2xl font-light mb-10 opacity-90 leading-relaxed max-w-2xl mx-auto">
                    {config.description || 'A catchy description for your product or service.'}
                  </p>
                  <button className={`px-10 py-4 rounded-full font-bold shadow-2xl transition-transform hover:scale-105 ${
                    config.theme === 'light' ? 'bg-blue-600 text-white hover:bg-blue-700' : 
                    config.theme === 'colorful' ? 'bg-white text-purple-600 hover:bg-slate-100' : 
                    'bg-white text-slate-900 hover:bg-slate-200'
                  }`}>Get Started</button>
                </div>
              </div>
            )}

            {config.template === 'blog' && (
              <div className="flex-1 flex flex-col">
                <header className={`px-6 py-12 md:py-16 text-center ${config.theme === 'light' ? 'bg-slate-100' : 'bg-black/40'}`}>
                  <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">{config.title || 'The Blog'}</h1>
                  <p className="text-sm md:text-base opacity-70 max-w-2xl mx-auto">{config.description || 'Welcome to the blog. I write about stuff.'}</p>
                </header>
                <div className="p-6 md:p-10 max-w-3xl lg:max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8">
                  <article className={`rounded-xl overflow-hidden hover:-translate-y-1 transition-transform shadow-xl ${config.theme === 'light' ? 'bg-white border border-slate-100' : 'bg-slate-900/50 border border-white/5'}`}>
                    {config.imageUrl ? (
                       <img src={config.imageUrl} className="w-full h-48 md:h-56 object-cover" />
                    ) : (
                       <div className="w-full h-48 md:h-56 bg-slate-800/50 flex items-center justify-center">
                         <span className="opacity-30">No Image</span>
                       </div>
                    )}
                    <div className="p-6">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2 block">Just Now</span>
                      <h3 className="text-xl font-bold mb-3 leading-tight">Your First Featured Post</h3>
                      <p className="opacity-70 text-sm line-clamp-3">This is a preview of how your recent blog posts will render on the homepage grid. It looks great!</p>
                    </div>
                  </article>
                </div>
              </div>
            )}
          </main>
          
          <footer className={`p-6 text-center text-xs opacity-50 ${config.theme === 'light' ? 'border-t border-slate-200' : 'border-t border-white/5'}`}>
            &copy; {new Date().getFullYear()} {config.title}. Created with Nexus AI.
          </footer>
        </div>
      </div>
    </div>
  );
};
