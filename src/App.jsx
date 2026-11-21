import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import {
  Headset, ShieldCheck, MessageCircle, Plus, LogOut, Send, ImagePlus,
  Copy, Check, Clock3, Search, ArrowLeft, RefreshCw, LockKeyhole, UserRound,
  Paperclip, X, ExternalLink, CircleHelp
} from 'lucide-react';

const shortCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const dateLabel = (value) => value ? new Date(value).toLocaleString('id-ID', { dateStyle:'short', timeStyle:'short' }) : '';
const roomUrl = (code) => `${window.location.origin}/?room=${encodeURIComponent(code)}`;

function SetupNotice() {
  return <div className="center"><div className="glass setup"><div className="brand-mark"><Headset/></div><h1>KENZ <span>CS</span></h1><h2>Konfigurasi Supabase belum diisi</h2><p>Buat file <code>.env</code> dari <code>.env.example</code>, lalu isi URL dan anon key project Supabase. Setelah itu jalankan ulang aplikasi.</p></div></div>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState(null);
  const [filter, setFilter] = useState('');
  const [roomBusy, setRoomBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef(null);
  const isAdmin = profile?.role === 'admin';
  const requestedRoom = useMemo(() => new URLSearchParams(window.location.search).get('room'), []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) { setProfile(null); return; }
    loadProfile();
  }, [session]);

  useEffect(() => {
    if (profile) loadRooms();
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (!activeRoom || !supabase) return;
    loadMessages(activeRoom.id);
    const channel = supabase.channel(`room-${activeRoom.id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'messages', filter:`room_id=eq.${activeRoom.id}` }, () => loadMessages(activeRoom.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeRoom?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  async function loadProfile() {
    const { data, error: e } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (e) { setError(e.message); return; }
    setProfile(data);
    if (!data) setError('Profil belum dibuat. Keluar lalu masuk kembali, atau jalankan SQL setup terbaru.');
  }

  async function loadRooms() {
    const query = supabase.from('rooms').select('*, profiles(username, phone)').order('updated_at', { ascending:false });
    const { data, error: e } = await query;
    if (e) setError(e.message); else {
      setRooms(data || []);
      if (requestedRoom && !activeRoom) {
        const found = (data || []).find(r => r.room_code === requestedRoom);
        if (found) setActiveRoom(found);
      }
    }
  }

  async function loadMessages(roomId) {
    const { data, error: e } = await supabase.from('messages').select('*').eq('room_id', roomId).order('created_at');
    if (e) setError(e.message); else setMessages(data || []);
  }

  async function guestLogin(e) {
    e.preventDefault(); setError(''); setNotice('');
    const digits = phone.replace(/[^\d+]/g, '');
    const cleanPhone = digits.startsWith('+') ? digits : `+${digits}`;
    if (username.trim().length < 2) return setError('Username minimal 2 karakter.');
    if (!/^\+[1-9]\d{7,14}$/.test(cleanPhone)) return setError('Masukkan nomor HP dengan kode negara, contoh 6281234567890.');
    setBusy(true);
    const { error: e2 } = await supabase.auth.signInAnonymously({
      options: { data: { username: username.trim(), phone: cleanPhone } }
    });
    setBusy(false);
    if (e2) setError(e2.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null); setProfile(null); setActiveRoom(null);
  }

  async function createRoom() {
    setRoomBusy(true); setError('');
    const { data, error: e } = await supabase.from('rooms').insert({
      owner_id: session.user.id, room_code: shortCode(), status:'open', subject:'Customer support'
    }).select('*, profiles(username, phone)').single();
    setRoomBusy(false);
    if (e) setError(e.message);
    else { setRooms(old => [data, ...old]); setActiveRoom(data); window.history.replaceState({}, '', `/?room=${data.room_code}`); }
  }

  async function sendMessage(e) {
    e?.preventDefault();
    if ((!draft.trim() && !photo) || !activeRoom) return;
    setBusy(true); setError('');
    let imageUrl = null;
    if (photo) {
      const ext = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${activeRoom.id}/${session.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('chat-photos').upload(path, photo, { upsert:false, contentType:photo.type });
      if (uploadError) { setBusy(false); setError(uploadError.message); return; }
      const { data } = supabase.storage.from('chat-photos').getPublicUrl(path);
      imageUrl = data.publicUrl;
    }
    const { error: e2 } = await supabase.from('messages').insert({
      room_id:activeRoom.id, sender_id:session.user.id, body:draft.trim(), image_url:imageUrl
    });
    setBusy(false);
    if (e2) setError(e2.message);
    else { setDraft(''); setPhoto(null); await loadMessages(activeRoom.id); await loadRooms(); }
  }

  async function closeRoom(room) {
    const { error: e } = await supabase.from('rooms').update({ status: room.status === 'closed' ? 'open' : 'closed' }).eq('id', room.id);
    if (e) setError(e.message); else { await loadRooms(); setActiveRoom({ ...room, status:room.status === 'closed' ? 'open' : 'closed' }); }
  }

  async function copyRoom(code) {
    await navigator.clipboard.writeText(roomUrl(code)); setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  if (!supabase) return <SetupNotice/>;
  if (!session) return <div className="auth-page"><div className="auth-glow"/><div className="auth-card glass">
    <div className="brand-mark"><Headset size={27}/></div><div className="eyebrow">CUSTOMER EXPERIENCE</div>
    <h1>KENZ <span>CS</span></h1><p className="muted">Pusat bantuan pelanggan. Masuk untuk membuat room percakapan.</p>
    <form onSubmit={guestLogin} className="stack">
      <label>Username</label><div className="input-wrap"><UserRound/><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Nama yang akan ditampilkan" required minLength="2"/></div>
      <label>Nomor HP / WhatsApp</label><div className="input-wrap"><MessageCircle/><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="6281234567890" required inputMode="tel"/></div>
      <button className="primary" disabled={busy}>{busy?'Memproses...':'MASUK KE WEBSITE'} <span>→</span></button>
      <small className="muted">Masuk langsung tanpa OTP. Nomor hanya dicatat sebagai informasi dan tidak diverifikasi sebagai akun WhatsApp.</small>
    </form>
    {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
    <div className="secure-note"><LockKeyhole size={14}/> Koneksi aman · KENZ Customer Service</div>
  </div></div>;

  if (!profile) return <div className="center"><div className="glass setup"><RefreshCw className="spin"/><h2>Memuat profil...</h2>{error&&<p className="error-text">{error}</p>}</div></div>;

  const visibleRooms = rooms.filter(r => `${r.room_code} ${r.profiles?.username||''} ${r.profiles?.phone||''}`.toLowerCase().includes(filter.toLowerCase()));
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark small"><Headset/></div><div><b>KENZ <span>CS</span></b><small>{isAdmin?'ADMIN CONSOLE':'CUSTOMER PORTAL'}</small></div></div>
      <div className="top-actions"><span className="online-dot"/> <span className="muted desktop-only">{profile.username || session.user.phone}</span><button className="icon-btn" onClick={signOut} title="Keluar"><LogOut size={17}/></button></div>
    </header>
    <main className="layout">
      <aside className="sidebar glass">
        <div className="side-heading"><div><div className="eyebrow">{isAdmin?'MANAGEMENT':'YOUR SUPPORT'}</div><h2>{isAdmin?'Inbox':'Percakapan'}</h2></div><button className="icon-btn" onClick={loadRooms}><RefreshCw size={16}/></button></div>
        <div className="searchbox"><Search size={16}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Cari room..."/></div>
        {!isAdmin && <button className="primary create-btn" onClick={createRoom} disabled={roomBusy}><Plus size={17}/>{roomBusy?'Membuat...':'Buat room baru'}</button>}
        <div className="room-list">
          {visibleRooms.map(room=><button key={room.id} className={`room-item ${activeRoom?.id===room.id?'selected':''}`} onClick={()=>{setActiveRoom(room);window.history.replaceState({},'',`/?room=${room.room_code}`);}}>
            <div className="avatar">{(isAdmin?room.profiles?.username:profile.username||'K').slice(0,1).toUpperCase()}</div>
            <div className="room-info"><b>{isAdmin?(room.profiles?.username||'Pelanggan'):`Room ${room.room_code}`}</b><small>{isAdmin?room.profiles?.phone:room.room_code} · {dateLabel(room.updated_at)}</small></div>
            <span className={`status-dot ${room.status==='closed'?'closed':''}`}/>
          </button>)}
          {!visibleRooms.length&&<div className="empty-list">Belum ada room.</div>}
        </div>
        <div className="side-foot"><ShieldCheck size={15}/> {isAdmin?'Akses administrator':'Sesi pelanggan'} terverifikasi</div>
      </aside>
      <section className="chat-panel glass">
        {activeRoom ? <>
          <div className="chat-head"><div className="chat-person"><div className="avatar large">{(isAdmin?activeRoom.profiles?.username:profile.username||'K').slice(0,1).toUpperCase()}</div><div><b>{isAdmin?(activeRoom.profiles?.username||'Pelanggan'):`Room ${activeRoom.room_code}`}</b><small>{isAdmin?activeRoom.profiles?.phone:'Customer support'} · <span className={activeRoom.status==='open'?'green':'muted'}>{activeRoom.status==='open'?'Aktif':'Ditutup'}</span></small></div></div>
            <div className="chat-tools"><button className="icon-btn" onClick={()=>copyRoom(activeRoom.room_code)} title="Salin link"><Copy size={16}/></button>{isAdmin&&<button className="outline-btn" onClick={()=>closeRoom(activeRoom)}>{activeRoom.status==='open'?'Tutup room':'Buka room'}</button>}</div>
          </div>
          <div className="room-link"><ExternalLink size={13}/><span>{roomUrl(activeRoom.room_code)}</span><button onClick={()=>copyRoom(activeRoom.room_code)}>{copied?<Check size={13}/>:<Copy size={13}/>}</button></div>
          <div className="messages">
            {messages.map(m=><div key={m.id} className={`message-row ${m.sender_id===session.user.id?'mine':'theirs'}`}><div className="bubble">
              {m.image_url&&<a href={m.image_url} target="_blank" rel="noreferrer"><img className="chat-image" src={m.image_url} alt="Lampiran chat"/></a>}
              {m.body&&<p>{m.body}</p>}<small>{dateLabel(m.created_at)} {m.sender_id===session.user.id?'· Anda':''}</small>
            </div></div>)}
            {!messages.length&&<div className="chat-empty"><div className="empty-icon"><MessageCircle/></div><b>Mulai percakapan</b><p>Kirim pesan pertama untuk memulai chat.</p></div>}
            <div ref={bottomRef}/>
          </div>
          {activeRoom.status==='open' ? <form className="composer" onSubmit={sendMessage}>
            {photo&&<div className="photo-chip"><Paperclip size={14}/>{photo.name}<button type="button" onClick={()=>setPhoto(null)}><X size={14}/></button></div>}
            <label className="attach-btn" title="Kirim foto"><ImagePlus size={19}/><input type="file" accept="image/*" onChange={e=>setPhoto(e.target.files?.[0]||null)} hidden/></label>
            <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Tulis pesan..." aria-label="Tulis pesan"/>
            <button className="send-btn" disabled={busy||(!draft.trim()&&!photo)}><Send size={17}/></button>
          </form>:<div className="closed-banner">Room ini ditutup. {isAdmin?'Buka kembali untuk membalas.':'Hubungi admin jika membutuhkan bantuan.'}</div>}
        </> : <div className="welcome-empty"><div className="empty-icon"><Headset/></div><h2>{isAdmin?'Pilih percakapan':'Selamat datang di KENZ CS'}</h2><p>{isAdmin?'Pilih room dari inbox untuk membaca dan membalas pesan.':'Buat room baru untuk mulai terhubung dengan customer service.'}</p>{!isAdmin&&<button className="primary" onClick={createRoom} disabled={roomBusy}><Plus size={17}/> Buat room sekarang</button>}</div>}
      </section>
    </main>
    {error&&<div className="toast-error">{error}<button onClick={()=>setError('')}><X size={14}/></button></div>}
  </div>;
}