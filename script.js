var expSys = (function(){
    
    var db,
        
        selectedSystem,
        
        // <option>'s list for every new rule condition
        questions_options,
        
        // counter, determines quantity of new rule conditions
        ruleConditionCounter = 0,
        
        false_answers = [],
        
        false_results = [],
        
        //array of question, that already being asked
        used_questions = [];
    
    /**
     * Gets expert-system names from db and put them into <select>
     */
    function refreshSystems(){
        var html = [];
        db.transaction(function(tx){
            tx.executeSql('SELECT * from Systems',[], function(tx, result){
                for (var i=0; i < result.rows.length; i++) {
                    html.push('<option value="'+result.rows.item(i).id+'">'+result.rows.item(i).name+'</option>');
                };
                document.getElementById('system_select').innerHTML = html.join('');        
            });
        });
    }
    
    /**
     * Grabs all rules from db and put them into table
     */
    function refreshRuleTable(){
        document.getElementById('rules_table').innerHTML = '<tr><td class="rules_table_if head_if" align="center">if</td><td class="rules_table_arrow" align="center"></td><td class="rules_table_then head_then" align="center">then</td><td class="rules_table_delete"></td></tr>';
        
        db.transaction(function(tx){
            
            tx.executeSql('SELECT Rules.id, Questions.question, Rules.answer, Rules.result FROM Questions, Rules WHERE Rules.question = Questions.id AND Rules.system = ? ORDER BY Rules.result', [selectedSystem], function(tx, result){
                var result_temp,
                    ifCondition = '',
                    get_new_row = function(ifCondition, result_temp){
                        var new_row = '<tr><td class="rules_table_if">'+ifCondition+'</td><td class="rules_table_arrow" align="center">&#x2192;</td><td class="rules_table_then">'+result_temp+'</td><td class="rules_table_delete"><button class="remove" onClick="expSys.removeRule(this,\''+result_temp+'\');">delete</button></td></tr>';
                        return new_row;
                    };
                    
                for (var y=0; y < result.rows.length; y++) {
                    if (result_temp){
                        
                        if (y == result.rows.length-1){
                            ifCondition +=' <span class="bold">&</span> (<span class="italic">'+result.rows.item(y).question+'</span>) '+result.rows.item(y).answer;
                            
                            var new_row = get_new_row(ifCondition, result_temp);
                            
                            document.getElementById('rules_table').innerHTML += new_row;
                        }
                        
                        if (result.rows.item(y).result !== result_temp){
                            var new_row = get_new_row(ifCondition, result_temp);
                            document.getElementById('rules_table').innerHTML += new_row;
                            
                            ifCondition = ""
                            result_temp = result.rows.item(y).result;
                            ifCondition +='(<span class="italic">'+result.rows.item(y).question+'</span>) '+result.rows.item(y).answer;
                        }else{
                            ifCondition +=' <span class="bold">&</span> (<span class="italic">'+result.rows.item(y).question+'</span>) '+result.rows.item(y).answer;
                        }
                    }else{
                        result_temp = result.rows.item(y).result;
                        ifCondition +='(<span class="italic">'+result.rows.item(y).question+'</span>) '+result.rows.item(y).answer;
                    }
                    
                };
            });
        });
    }
    
    /**
     * Refresh question for <select>'s in new rule form
     */
    function refreshQuestions(){
        db.transaction(function(tx){
            tx.executeSql('SELECT * FROM Questions WHERE system = ?',[selectedSystem],function(tx,result){
                questions_options = '';
                for (var i=0; i < result.rows.length; i++) {
                   questions_options += "<option value='"+result.rows.item(i).id+"'>"+result.rows.item(i).question+"</option>";
                };         
           });
        });
    }
    
    /**
     * Creates SQL-friendly string with 'answers' and 'results' that should be ignored
     */
    function falseResultsAndAnswersSQL(){
        var answers_string = '',
            results_string = '';
        
        if (false_answers.length > 0){
            answers_string = " AND Rules.answer NOT IN ('"+false_answers.join("','")+"')";
        }
        
        if (false_results.length > 0){
            results_string = " AND Rules.result NOT IN ('"+false_results.join("','")+"')";
        }
        
        return answers_string+results_string;
    }
    
    /**
     * Creates SQL-friendly string, which contained 'questions' already used by AnalyseSystem()
     */
    function usedQuestionsSQL(){
        var user_questions_string = '';
        
        if (used_questions.length > 0){
            user_questions_string = " WHERE question NOT IN ('"+used_questions.join("','")+"')";
        };
        
        return user_questions_string;
    }
    
    /**
     * Print expert system's output
     */
    function printResult(){
        db.transaction(function(tx){
            tx.executeSql("SELECT Rules.result FROM Rules WHERE Rules.system = ? "+falseResultsAndAnswersSQL()+" GROUP BY Rules.result",[selectedSystem], function(tx,result){
                var results = [],
                    output_message,
                    footer = "<p style='margin-top:25px;'><a href='javascript:expSys.startSystem();'> ♺ one more time</a></p>";
                
                document.getElementById('next_question').innerHTML = "<b>Result:</b>";
                
                for (var i=0; i < result.rows.length; i++) {
                    results.push(result.rows.item(i).result);
                };
                
                var result_text = document.getElementById('next_question_options');
                
                if (results.length == 0){
                    result_text.innerHTML = "There is no result for that answers";
                }else if(results.length == 1){
                    result_text.innerHTML = results[0];
                }else{
                    document.getElementById('next_question').innerHTML = "<b>Results:</b></br>";
                    result_text.innerHTML = "<ul><li>"+results.join('</li><li>')+"</li><ul><br />";
                }
                
                result_text.innerHTML += footer;
                document.getElementById('next_question_button_wrap').style.display = "none";
           });
        });
    }
    
    /**
     * Core function. Used to analyse data, and ask 'right' question
     */
    function analyseSystem(){
        
        // checks how many results left
        db.transaction(function(tx){
            tx.executeSql("SELECT COUNT(DISTINCT Result) AS count FROM Rules WHERE system = ? "+falseResultsAndAnswersSQL(),[selectedSystem], function(tx,result){
                var resultsLeft = result.rows.item(0).count;
                console.log(resultsLeft);
                if (resultsLeft == 0){
                    printResult();
                }else if (resultsLeft == 1){
                    printResult();
                }else{
                    
                    // more than one result, let's try ask another question
                    
                    // next question should have minimal number of diffirent answers and maximum quantity in rules table
                    // speaking SQL Language, we should find question with maximum 'x', where 'x' is: COUNT(Rules.question)-COUNT(DISTINCT Rules.answer)
                    
                    tx.executeSql("SELECT question, question_name, COUNT(question) AS count, COUNT(question)-COUNT(DISTINCT answer) as x FROM( SELECT Questions.question as question_name, Rules.question as question, Rules.answer as answer From Rules, Questions WHERE Rules.system = ? AND Rules.question = Questions.id "+falseResultsAndAnswersSQL()+") s "+usedQuestionsSQL()+" GROUP BY question ORDER BY x", [selectedSystem], function(tx, result){
                        var next_question,
                            max_x = -1;
                        for (var i=0; i < result.rows.length; i++) {
                            if (!(result.rows.item(i).question in used_questions)){
                                if (result.rows.item(i).x > max_x){
                                    next_question = result.rows.item(i);
                                    max_x = result.rows.item(i).x;
                                };
                            };
                        };
                        
                        if (!next_question || typeof(next_question) == 'undefined') printResult();
                        
                        used_questions.push(next_question.question);
                        
                        //output next_question title
                        document.getElementById('next_question').innerHTML = next_question.question_name;
                        
                        //get and output next_questions options
                        console.log('SELECT DISTINCT answer FROM Rules WHERE question = '+next_question.question+' AND system ='+selectedSystem)
                        tx.executeSql("SELECT DISTINCT answer FROM Rules WHERE question = ? "+falseResultsAndAnswersSQL()+" AND system = ?",[next_question.question, selectedSystem], function(tx, result){
                            
                            if (result.rows.length == 0) printResults();
                            
                            var options = '';
                            for (var i=0; i < result.rows.length; i++) {
                                options += "<input type='radio' class='expSys_option' name='expSys_option' id='option"+i+"' value='"+result.rows.item(i).answer+"'/> <label for='option"+i+"'>"+result.rows.item(i).answer+"</label><br />";                                
                            };
                            
                            document.getElementById('next_question_options').innerHTML = options;
                            
                        });
                    });
                };
           });
        });
    }
    
    /**
     * Add 'active' class to menu element
     * @param {DOMElement} selector - wannabe active selector
     */
    function activeMenuElement(activeSelector){
        
        var menuSelectors = {'systems':'systems_button', 'questions':'questions_button', 'rules':'rules_button', 'start':'start_button'};
        
        for (var selector in menuSelectors) {
            if (menuSelectors.hasOwnProperty(selector)){
                if (selector == activeSelector){
                    document.getElementById(selector).style.display = "inherit";
                    document.getElementById(menuSelectors[selector]).className = "active";
                }else{
                    document.getElementById(selector).style.display = "none";
                    document.getElementById(menuSelectors[selector]).className = "";
                }
            };
            
        }
        
        if (activeSelector == "systems"){
            document.getElementById('navigation').style.display = "none";
            document.getElementById('system_name').style.display = "none";
        }else{
            document.getElementById('navigation').style.display = "inherit";
            document.getElementById('system_name').style.display = "inherit";
        }
    }
    
    /**
     * Reset globals
     */
    function resetAnalyseSystem(){
        false_answers = [];
        false_results = [];
        used_questions = [];
        document.getElementById('next_question_button_wrap').style.display = "inherit";
    }
    
    /**
    * Drop all databases. Used in debuging
    */
    function dropTables(){
       db.transaction(function(tx){
           tx.executeSql('DROP TABLE Systems;',[]);
           tx.executeSql('DROP TABLE Questions;',[]);
           tx.executeSql('DROP TABLE Rules;',[]);
       });
    }
    
    return {
        
        /**
         * Entry point
         */
        initialize: function(){
            
            // open or create database if not exists
            if (window.openDatabase) {
                db = openDatabase('exSys', '1.0', 'exSys',2*1024*1024);

                db.transaction(function (tx) {
                    tx.executeSql('CREATE TABLE IF NOT EXISTS Systems (id INTEGER PRIMARY KEY, name TEXT);', []);
                    
                    tx.executeSql('CREATE TABLE IF NOT EXISTS Questions (id INTEGER PRIMARY KEY, question TEXT, system INTEGER);', []);
                    
                    tx.executeSql('CREATE TABLE IF NOT EXISTS Rules (id INTEGER PRIMARY KEY, question INTEGER, answer TEXT, result TEXT, system INTEGER);', []);
                    
                    
                    // check if expert_systems exists, and create demo one if it's not
                    tx.executeSql('SELECT COUNT(name) as count FROM Systems', [], function(tx, result){
                        if (result.rows.item(0).count == 0){
                            tx.executeSql('INSERT INTO Systems (name) VALUES (?)', ['videogames (demo)']);
                            
                            tx.executeSql('INSERT INTO Questions (question, system) VALUES (?,?)', ['Japanese?',1]);
                            tx.executeSql('INSERT INTO Questions (question, system) VALUES (?,?)', ['Platform',1]);
                            tx.executeSql('INSERT INTO Questions (question, system) VALUES (?,?)', ['Genre',1]);
                            
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [1,'No','Half-Life',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [1,'Yes','Final Fantasy XI',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [1,'Yes','Metal Gear Solid',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [1,'Yes','Legend Of Zelda',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [1,'Yes','Resident Evil',1]);
                            
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [2,'PC','Half-Life',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [2,'PC','Final Fantasy XI',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [2,'PSOne','Metal Gear Solid',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [2,'Wii','Legend Of Zelda',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [2,'PSOne','Resident Evil',1]);
                            
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [3,'FPS','Half-Life',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [3,'MMORPG','Final Fantasy XI',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [3,'Action','Metal Gear Solid',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [3,'Adventure','Legend Of Zelda',1]);
                            tx.executeSql('INSERT INTO Rules (question, answer, result, system) VALUES (?,?,?,?)', [3,'Action','Resident Evil',1]);

                        };
                    });
                });
                
                refreshSystems();
                
            }
            else{
                alert("Sorry, your browser don't support Web SQL Database API");
            }
        },
        
        
        //  -- Systems CRUD --
        
        selectSystem: function(){
            selectedSystem = document.getElementById('system_select').value;
            if (selectedSystem){
                var system_select = document.getElementById('system_select');
                document.getElementById('system_name').innerHTML = system_select.options[system_select.selectedIndex].text;
                
                this.showQuestions();
                refreshQuestions();
            }
            
            
        },
        
        addSystem: function(){
            var name = prompt("Give new expert system a name:", "");
            
            if (name){
                db.transaction(function(tx){
                    console.log(name);
                    tx.executeSql('INSERT INTO Systems (name) VALUES(?)',[name], function(tx, result){
                        refreshSystems();
                        console.log(result.rows);
                    });
                });
            }
        },
        
        removeSystem: function(){
            var id = document.getElementById('system_select').value;
            if (id){
                if (confirm('are you sure?')){
                    db.transaction(function(tx){
                        tx.executeSql('DELETE FROM Rules WHERE system = ?', [id]);
                        tx.executeSql('DELETE FROM Questions WHERE system = ?', [id]);
                        tx.executeSql('DELETE FROM Systems  WHERE id = ?', [id], function(tx, result){
                            refreshSystems();
                        });
                    });
                };
            };
        },
        
        backToSystemSelection: function(){
            activeMenuElement('systems');
        },
        
        //  -- Questions CRUD --
        
        showQuestions: function(){

            activeMenuElement('questions');

            var html = [];
            db.transaction(function(tx){
                tx.executeSql('SELECT * from Questions WHERE system = ?', [selectedSystem], function(tx, result){
                    for (var i=0; i < result.rows.length; i++) {
                        html.push('<tr><td class="question">'+result.rows.item(i).question+'</td><td class="remove_question"><button class="remove" onclick="javascript:expSys.removeQuestion(this,'+result.rows.item(i).id+');">delete</button></td></tr>');
                    };
                    document.getElementById('questions_table').innerHTML = html.join('');
                });
            });
        },

        addQuestion: function(){
            
            var question = document.getElementById('new_question').value;
            var question_list = document.getElementById('questions_table');
            
            if (question){
                db.transaction(function(tx){
                    tx.executeSql('INSERT INTO Questions (question, system) VALUES(?,?)',[question, selectedSystem], function(tx, result){
                        question_list.innerHTML += '<tr><td class="question">'+question+'</td><td class="remove_question"><button class="remove" onclick="javascript:expSys.removeQuestion(this,'+result.insertId+');">delete</button></td></tr>';
                        document.getElementById('new_question').value = "";
                        refreshQuestions();
                    });
                });
            };
            
        },
        
        /**
         * Remove 'question'-entry both from db and table
         * @param {Node} trigger - reference to element triggered the function
         * @param {Integer} questionId - id of the element, which needs to be deleted  
         */
        removeQuestion: function(trigger, questionId){
            db.transaction(function(tx){
                tx.executeSql('DELETE FROM Questions WHERE id = ?',[questionId], function(tx, result){
                    var tr = trigger.parentNode.parentNode;
                    tr.parentNode.removeChild(tr);
                    refreshQuestions();
                });
            });
        },
        
        // -- Rules CRUD --
        
        showRules: function(){
            
            activeMenuElement('rules');
            
            document.getElementById('select_question_0').innerHTML = questions_options;
            ruleConditionCounter = 0;
            
            refreshRuleTable();
            
        },
        
        showNewRuleForm: function(){
            var new_rule = document.getElementById('new_rule');
            if (!new_rule.style.display || new_rule.style.display == "none"){
                new_rule.style.display = "inherit";
            }else{
                new_rule.style.display = "none";
            }
        },
        
        addRuleCondition: function(){
            
            ruleConditionCounter++;
            
            var new_rule = '<button class="delete_rule_button" onclick="javascript:expSys.removeRuleCondition(this); return false;" />-</button> <select class="rule_select" id="select_question_'+ruleConditionCounter+'" name="select_question_'+ruleConditionCounter+'">'+questions_options+'</select> <input name="rule_answer_'+ruleConditionCounter+'" class="rule_answer" id="rule_answer_'+ruleConditionCounter+'" type="text" />';
            
            var newElement = document.createElement('div');
            newElement.setAttribute('id', 'rule_entry_'+ruleConditionCounter);
            newElement.setAttribute('class', 'rule_entry');
            newElement.innerHTML = new_rule;
            document.getElementById('new_rules_container').appendChild(newElement);
            
        },
        
        saveRule: function(){
            
            var rulesToSave = [];
            
            if (document.getElementById('rule_result').value.length == 0){
                alert('result cannot be empty!');
            }else{
                for (var i=0; i < ruleConditionCounter+1; i++) {
                    if (document.getElementById('rule_entry_'+i)){
                        if (document.getElementById('rule_answer_'+i).value.length > 0){
                                rulesToSave.push("'"+document.getElementById("select_question_"+i).value+"','"+document.getElementById("rule_answer_"+i).value+"','"+document.getElementById("rule_result").value+"','"+selectedSystem+"'");
                        
                        }else{
                            alert('answers cannot be empty!');
                            rulesToSave = [];
                            break;
                        }
                    };
                };
                if (rulesToSave){
                    db.transaction(function(tx){
                        for (var i=0; i < rulesToSave.length; i++) {
                            console.log('INSERT INTO Rules(question, answer, result, system) VALUES ('+rulesToSave[i]+')');
                            tx.executeSql('INSERT INTO Rules(question, answer, result, system) VALUES ('+rulesToSave[i]+')',[]);
                            if (i == rulesToSave.length-1){
                                document.getElementById('rule_result').value = "";
                                document.getElementById('rule_answer_0').value = "";
                                document.getElementById('new_rules_container').innerHTML = "";
                                expSys.showNewRuleForm();
                                refreshRuleTable();
                            };
                        };
                    });
                }
            }
        },
        
        /**
         * Remove rule-entry both from db and table
         * @param {Node} trigger - reference to element triggered the function
         * @param {String} resultName - result, which needs to be deleted  
         */
        removeRule: function(trigger, resultName){
            db.transaction(function(tx){
                tx.executeSql('DELETE FROM Rules WHERE result = ?',[resultName], function(tx, result){
                    var tr = trigger.parentNode.parentNode;
                    tr.parentNode.removeChild(tr);
                });
            });
        },
        
        removeRuleCondition: function(trigger){
             var div = trigger.parentNode;
                div.parentNode.removeChild(div);
        },
        
        // --  Start --
        
        startSystem: function(){
            activeMenuElement('start');
            resetAnalyseSystem();
            analyseSystem();
        },
        
        nextStep: function(){
            
            var options = document.getElementsByClassName('expSys_option'),
                selected_value;
            
            for (var i=0; i < options.length; i++) {
                if (options[i].checked){
                    selected_value = options[i].value;
                }
                else{
                    false_answers.push(options[i].value);
                }
            }
            
            if (!selected_value) alert('!selected_value');
            
            //get false_results
            
            db.transaction(function(tx){
                
                tx.executeSql("SELECT DISTINCT result FROM Rules WHERE answer in ('"+false_answers.join("','")+"') AND system = ? ", [selectedSystem], function(tx, result){
                    for (var i=0; i < result.rows.length; i++) {
                        if (!(result.rows.item(i).result in false_results)){
                            false_results.push(result.rows.item(i).result);
                        };
                    };
                    
                    analyseSystem();
                })
            })
        },
        
        dropTables:dropTables,
    }
    
})();