   document.addEventListener('DOMContentLoaded', function() {
            // Éléments du DOM
            const gameBoard = document.getElementById('game-board');
            const movesDisplay = document.getElementById('moves');
            const timerDisplay = document.getElementById('timer');
            const scoreDisplay = document.getElementById('score');
            const startBtn = document.getElementById('start-btn');
            const resetBtn = document.getElementById('reset-btn');
            const difficultyBtns = document.querySelectorAll('.difficulty-btn');
            const winModal = document.getElementById('win-modal');
            const finalMoves = document.getElementById('final-moves');
            const finalTime = document.getElementById('final-time');
            const finalScore = document.getElementById('final-score');
            const playAgainBtn = document.getElementById('play-again-btn');
            
            // Variables du jeu
            let cards = [];
            let flippedCards = [];
            let moves = 0;
            let matchedPairs = 0;
            let timer = 0;
            let timerInterval;
            let gameStarted = false;
            let difficulty = 'easy';
            let score = 0;
            
            // Symboles pour les cartes 
            const symbols = ['🍎', '🍌', '🍒', '🍇', '🍊', '🍓', '🍑', '🍍', '🥭', '🍉', '🍐', '🥝'];
            
            // Configuration de difficulté
            const difficultyConfig = {
                easy: { pairs: 6, gridColumns: 4 },
                medium: { pairs: 8, gridColumns: 4 },
                hard: { pairs: 12, gridColumns: 4 }
            };
            
            // Initialisation du jeu
            function initGame() {
                // Réinitialiser les variables
                cards = [];
                flippedCards = [];
                moves = 0;
                matchedPairs = 0;
                timer = 0;
                score = 0;
                gameStarted = false;
                
                // Mettre à jour l'affichage
                movesDisplay.textContent = moves;
                timerDisplay.textContent = `${timer}s`;
                scoreDisplay.textContent = score;
                
                // Arrêter le minuteur s'il est en cours
                clearInterval(timerInterval);
                
                // Vider le plateau de jeu
                gameBoard.innerHTML = '';
                
                // Créer les cartes
                createCards();
                
                // Masquer le modal de victoire
                winModal.style.display = 'none';
            }
            
            // Créer les cartes selon la difficulté
            function createCards() {
                const config = difficultyConfig[difficulty];
                const pairs = config.pairs;
                
                // Sélectionner les symboles aléatoirement
                const selectedSymbols = [];
                const allSymbols = [...symbols];
                // S'assurer qu'il y a assez de symboles
                for (let i = 0; i < pairs; i++) {
                    const randomIndex = Math.floor(Math.random() * allSymbols.length);
                    selectedSymbols.push(allSymbols[randomIndex]);
                    allSymbols.splice(randomIndex, 1);
                }
                
                // Dupliquer les symboles pour créer des paires
                const cardSymbols = [...selectedSymbols, ...selectedSymbols];
                
                // Mélanger les cartes
                shuffleArray(cardSymbols);
                
                // Créer les éléments de carte
                cardSymbols.forEach((symbol, index) => {
                    const card = document.createElement('div');
                    card.className = 'card';
                    card.dataset.symbol = symbol;
                    card.dataset.index = index;
                    
                    card.innerHTML = `
                        <div class="card-inner">
                            <div class="card-front">${symbol}</div>
                            <div class="card-back">?</div>
                        </div>
                    `;
                    
                    card.addEventListener('click', () => flipCard(card));
                    gameBoard.appendChild(card);
                    cards.push(card);
                });
                
                // Ajuster la grille selon la difficulté
                gameBoard.style.gridTemplateColumns = `repeat(${config.gridColumns}, 1fr)`;
            }
            
            // Mélanger un tableau (algorithme de Fisher-Yates)
            function shuffleArray(array) {
                for (let i = array.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [array[i], array[j]] = [array[j], array[i]];
                }
                return array;
            }
            
            // Retourner une carte
            function flipCard(card) {
                // Ne pas retourner si la carte est déjà retournée ou si deux cartes sont déjà retournées
                if (card.classList.contains('flipped') || card.classList.contains('matched') || flippedCards.length >= 2) {
                    return;
                }
                
                // Démarrer le jeu et le minuteur si ce n'est pas déjà fait
                if (!gameStarted) {
                    startGame();
                }
                
                // Retourner la carte
                card.classList.add('flipped');
                flippedCards.push(card);
                
                // Vérifier si deux cartes sont retournées
                if (flippedCards.length === 2) {
                    moves++;
                    movesDisplay.textContent = moves;
                    
                    // Vérifier si les cartes correspondent
                    checkForMatch();
                }
            }
            
            // Vérifier si les deux cartes retournées correspondent
            function checkForMatch() {
                const [card1, card2] = flippedCards;
                const isMatch = card1.dataset.symbol === card2.dataset.symbol;
                
                if (isMatch) {
                    // Les cartes correspondent
                    card1.classList.add('matched');
                    card2.classList.add('matched');
                    matchedPairs++;
                    
                    // Calculer le score
                    calculateScore();
                    
                    // Vérifier si le jeu est terminé
                    if (matchedPairs === difficultyConfig[difficulty].pairs) {
                        endGame();
                    }
                    
                    flippedCards = [];
                } else {
                    // Les cartes ne correspondent pas, les retourner après un délai
                    setTimeout(() => {
                        card1.classList.remove('flipped');
                        card2.classList.remove('flipped');
                        flippedCards = [];
                    }, 1000);
                }
            }
            
            // Démarrer le jeu
            function startGame() {
                gameStarted = true;
                timerInterval = setInterval(() => {
                    timer++;
                    timerDisplay.textContent = `${timer}s`;
                }, 1000);
            }
            
            // Terminer le jeu
            function endGame() {
                clearInterval(timerInterval);
                
                // Calculer le score final
                calculateScore(true);
                
                // Afficher le modal de victoire
                finalMoves.textContent = moves;
                finalTime.textContent = timer;
                finalScore.textContent = score;
                winModal.style.display = 'flex';
            }
            
            // Calculer le score
            function calculateScore(isFinal = false) {
                // Base du score : 100 points par paire trouvée
                let newScore = matchedPairs * 100;
                
                // Bonus pour la rapidité (plus le temps est court, plus le bonus est élevé)
                if (timer > 0) {
                    const timeBonus = Math.max(0, 500 - timer * 5);
                    newScore += timeBonus;
                }
                
                // Bonus pour l'efficacité (moins de coups = plus de points)
                if (moves > 0) {
                    const efficiencyBonus = Math.max(0, 300 - moves * 10);
                    newScore += efficiencyBonus;
                }
                
                // Pénalité pour la difficulté (plus c'est difficile, plus le multiplicateur est élevé)
                const difficultyMultiplier = {
                    easy: 1,
                    medium: 1.5,
                    hard: 2
                };
                
                newScore = Math.floor(newScore * difficultyMultiplier[difficulty]);
                
                score = newScore;
                scoreDisplay.textContent = score;
                
                return score;
            }
            
            // Événements
            startBtn.addEventListener('click', initGame);
            resetBtn.addEventListener('click', initGame);
            
            difficultyBtns.forEach(btn => {
                btn.addEventListener('click', function() {
                    difficultyBtns.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    difficulty = this.dataset.difficulty;
                    initGame();
                });
            });
            
            playAgainBtn.addEventListener('click', function() {
                initGame();
            });
            
            // Simulation d'AJAX - charger les symboles depuis un "serveur"
            function loadSymbolsFromServer() {
                // Simuler une requête AJAX avec setTimeout
                setTimeout(() => {
                    console.log("Symboles chargés avec succès via AJAX simulé");
                    // Dans une vraie application, nous utiliserions fetch() ou XMLHttpRequest
                    // et mettrions à jour les symboles avec la réponse du serveur
                }, 500);
            }
            
            // Initialiser le jeu au chargement de la page
            initGame();
            loadSymbolsFromServer();
        });