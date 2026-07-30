/* =========================================================
   LOGIN / ÁREA RESTRITA
   ========================================================= */
function fazerLogin(ev){
  ev.preventDefault();
  const usuario = document.getElementById('loginUsuario').value.trim();
  const senha = document.getElementById('loginSenha').value;
  const btn = document.getElementById('btnLoginSubmit');
  const erroEl = document.getElementById('loginErro');
  erroEl.classList.add('hidden');
  if(!usuario || !senha) return false;
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  fetch(CONFIG.URL_API, {
    method: 'POST',
    body: JSON.stringify({ token: CONFIG.TOKEN, action: 'login', usuario: usuario, senha: senha })
  })
    .then(r => r.json())
    .then(resp => {
      btn.disabled = false;
      btn.textContent = 'Entrar';
      if(resp.erro || !resp.ok || !resp.sessionToken){
        erroEl.textContent = 'Usuário ou senha incorretos.';
        erroEl.classList.remove('hidden');
        return;
      }
      localStorage.setItem('sessaoToken', resp.sessionToken);
      localStorage.setItem('sessaoUsuario', usuario);
      document.getElementById('loginSenha').value = '';
      entrarNoApp();
    })
    .catch(err => {
      btn.disabled = false;
      btn.textContent = 'Entrar';
      erroEl.textContent = 'Não foi possível conectar. Verifique sua internet.';
      erroEl.classList.remove('hidden');
      console.error(err);
    });
  return false;
}

function entrarNoApp(){
  document.body.classList.add('autenticado');
  carregarDoServidor();
}

function voltarParaLogin(mensagem){
  localStorage.removeItem('sessaoToken');
  localStorage.removeItem('sessaoUsuario');
  document.body.classList.remove('autenticado');
  state = estadoPadrao();
  carregando = true;
  if(mensagem){
    const erroEl = document.getElementById('loginErro');
    erroEl.textContent = mensagem;
    erroEl.classList.remove('hidden');
  }
}

function sair(){
  if(dirty){
    if(!confirm('Existem alterações que podem não ter sido salvas. Sair mesmo assim?')) return;
  }
  // Avisa o servidor pra invalidar esse token de sessão agora mesmo, em vez de deixar
  // ele válido por até 30 dias mesmo depois de sair. "Melhor esforço": se não tiver
  // internet, sai do painel local mesmo assim.
  if(!configuracaoPendente() && sessaoAtual()){
    fetch(CONFIG.URL_API, {
      method: 'POST',
      body: JSON.stringify({ token: CONFIG.TOKEN, sessao: sessaoAtual(), action: 'logout' })
    }).catch(() => {});
  }
  voltarParaLogin();
}

/* =========================================================
   USUÁRIOS (gerenciar quem tem acesso ao painel)
   ========================================================= */
function abrirUsuarios(){
  document.getElementById('usuariosWrap').classList.remove('hidden');
  document.getElementById('usuariosErro').classList.add('hidden');
  document.getElementById('usuariosMsg').classList.add('hidden');
  document.getElementById('formCadastrarUsuario').reset();
  carregarListaUsuarios();
}

function fecharUsuarios(){
  document.getElementById('usuariosWrap').classList.add('hidden');
}

function carregarListaUsuarios(){
  const ul = document.getElementById('usuariosLista');
  ul.innerHTML = '<li>Carregando...</li>';
  fetch(CONFIG.URL_API, {
    method: 'POST',
    body: JSON.stringify({ token: CONFIG.TOKEN, sessao: sessaoAtual(), action: 'listarUsuarios' })
  })
    .then(r => r.json())
    .then(dados => {
      if(sessaoInvalida(dados.erro)){ fecharUsuarios(); voltarParaLogin('Sua sessão expirou — faça login novamente.'); return; }
      if(dados.erro){ ul.innerHTML = '<li>' + esc(dados.erro) + '</li>'; return; }
      const usuarios = dados.usuarios || [];
      if(!usuarios.length){ ul.innerHTML = '<li>Nenhum usuário cadastrado.</li>'; return; }
      ul.innerHTML = usuarios.map(u =>
        '<li><span>' + esc(u) + '</span><button type="button" onclick="removerUsuarioUi(\'' + esc(u).replace(/'/g,"\\'") + '\')">Remover</button></li>'
      ).join('');
    })
    .catch(err => {
      ul.innerHTML = '<li>Erro ao carregar usuários.</li>';
      console.error(err);
    });
}

function cadastrarUsuario(ev){
  ev.preventDefault();
  const usuario = document.getElementById('novoUsuarioNome').value.trim();
  const senha = document.getElementById('novoUsuarioSenha').value;
  const senha2 = document.getElementById('novoUsuarioSenha2').value;
  const erroEl = document.getElementById('usuariosErro');
  const msgEl = document.getElementById('usuariosMsg');
  const btn = document.getElementById('btnCadastrarUsuarioSubmit');
  erroEl.classList.add('hidden');
  msgEl.classList.add('hidden');

  if(!usuario || !senha){ erroEl.textContent = 'Preencha usuário e senha.'; erroEl.classList.remove('hidden'); return false; }
  if(senha !== senha2){ erroEl.textContent = 'As senhas não coincidem.'; erroEl.classList.remove('hidden'); return false; }
  if(senha.length < 4){ erroEl.textContent = 'A senha deve ter pelo menos 4 caracteres.'; erroEl.classList.remove('hidden'); return false; }

  btn.disabled = true;
  btn.textContent = 'Cadastrando...';
  fetch(CONFIG.URL_API, {
    method: 'POST',
    body: JSON.stringify({ token: CONFIG.TOKEN, sessao: sessaoAtual(), action: 'criarUsuario', usuario: usuario, senha: senha })
  })
    .then(r => r.json())
    .then(dados => {
      btn.disabled = false;
      btn.textContent = 'Cadastrar usuário';
      if(sessaoInvalida(dados.erro)){ fecharUsuarios(); voltarParaLogin('Sua sessão expirou — faça login novamente.'); return; }
      if(dados.erro){ erroEl.textContent = dados.erro; erroEl.classList.remove('hidden'); return; }
      msgEl.textContent = 'Usuário "' + usuario + '" cadastrado com sucesso!';
      msgEl.classList.remove('hidden');
      document.getElementById('formCadastrarUsuario').reset();
      carregarListaUsuarios();
    })
    .catch(err => {
      btn.disabled = false;
      btn.textContent = 'Cadastrar usuário';
      erroEl.textContent = 'Não foi possível conectar. Verifique sua internet.';
      erroEl.classList.remove('hidden');
      console.error(err);
    });
  return false;
}

function removerUsuarioUi(usuario){
  if(!confirm('Remover o acesso do usuário "' + usuario + '"?')) return;
  fetch(CONFIG.URL_API, {
    method: 'POST',
    body: JSON.stringify({ token: CONFIG.TOKEN, sessao: sessaoAtual(), action: 'removerUsuario', usuario: usuario })
  })
    .then(r => r.json())
    .then(dados => {
      if(sessaoInvalida(dados.erro)){ fecharUsuarios(); voltarParaLogin('Sua sessão expirou — faça login novamente.'); return; }
      if(dados.erro){ alert(dados.erro); return; }
      carregarListaUsuarios();
    })
    .catch(err => {
      alert('Erro de conexão.');
      console.error(err);
    });
}

window.addEventListener('beforeunload', function(e){
  if(dirty){
    e.preventDefault();
    e.returnValue = '';
  }
});

