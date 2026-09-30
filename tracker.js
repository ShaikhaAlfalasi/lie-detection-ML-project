// ============================================
// SUPABASE CONFIGURATION
// ============================================

const SUPABASE_URL =
    "https://ycutuygfixmigdgakoar.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_ia2-4KZkQgfWL-RvTf9VYw_iPE8-Lad";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


// ============================================
// EXPERIMENT SETTINGS
// ============================================

const TOTAL_QUESTIONS = 4;
const MAX_CHARACTERS = 300;
const PAUSE_THRESHOLD = 1000; // milliseconds


// ============================================
// PAGE ELEMENTS
// ============================================

const pageTitle =
    document.getElementById("pageTitle");

const textInput =
    document.getElementById("textInput");

const submitButton =
    document.getElementById("submitButton");

const questionText =
    document.getElementById("questionText");

const questionProgress =
    document.getElementById("questionProgress");

const conditionInstruction =
    document.getElementById("conditionInstruction");

const characterCountElement =
    document.getElementById("characterCount");

const completionMessage =
    document.getElementById("completionMessage");


// ============================================
// EXPERIMENT STATE
// ============================================

let participantId = null;

let experimentQuestions = [];

let currentQuestionIndex = 0;

let currentQuestionId = null;
let currentQuestionText = null;
let currentCondition = null;


// ============================================
// TYPING TRACKER STATE
// ============================================

let startTime = null;
let firstKeyTime = null;
let lastKeyTime = null;
let previousTypingKeyTime = null;

let keystrokeCount = 0;
let backspaceCount = 0;

let pauses = [];

let burstStartTime = null;
let currentBurstKeystrokes = 0;

let burstDurations = [];
let burstKeystrokes = [];


// ============================================
// ROUND TO 3 DECIMAL PLACES
// ============================================

function roundTo3(value) {

    return Number(value.toFixed(3));
}


// ============================================
// DETECT DEVICE TYPE
// ============================================

function getDeviceType() {

    const userAgent =
        navigator.userAgent.toLowerCase();


    if (
        /mobile|android|iphone|ipad|ipod/.test(
            userAgent
        )
    ) {

        if (
            /ipad|tablet/.test(userAgent)
        ) {
            return "tablet";
        }

        return "phone";
    }


    if (/laptop/.test(userAgent)) {
        return "laptop";
    }


    if (
        navigator.maxTouchPoints > 0 &&
        window.innerWidth <= 1024
    ) {
        return "tablet";
    }


    return "desktop";
}


// ============================================
// SHUFFLE ARRAY
// ============================================

function shuffle(array) {

    const shuffled = [...array];


    for (
        let i = shuffled.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );


        [
            shuffled[i],
            shuffled[j]
        ] = [
            shuffled[j],
            shuffled[i]
        ];
    }


    return shuffled;
}


// ============================================
// RESET TYPING TRACKER
// ============================================

function resetTypingTracker() {

    // Start timer when the question is displayed.
    // This is used to calculate first-key delay
    // and total response time.

    startTime =
        performance.now();


    firstKeyTime = null;
    lastKeyTime = null;
    previousTypingKeyTime = null;

    keystrokeCount = 0;
    backspaceCount = 0;

    pauses = [];

    burstStartTime = null;
    currentBurstKeystrokes = 0;

    burstDurations = [];
    burstKeystrokes = [];

    updateCharacterCount();
}


// ============================================
// CHARACTER COUNTER
// ============================================

function updateCharacterCount() {

    const characterCount =
        textInput.value.length;


    characterCountElement.textContent =
        `Characters: ${characterCount} / ${MAX_CHARACTERS}`;
}


// ============================================
// INPUT LISTENER
// ============================================

textInput.addEventListener(
    "input",
    function () {

        updateCharacterCount();
    }
);


// ============================================
// DETERMINE WHETHER KEY IS A TYPING KEY
// ============================================

function isTypingKey(event) {

    // Backspace
    if (event.key === "Backspace") {
        return true;
    }


    // Space
    if (event.key === " ") {
        return true;
    }


    // Normal characters
    if (event.key.length === 1) {
        return true;
    }


    return false;
}


// ============================================
// DISPLAY CURRENT QUESTION
// ============================================

function displayCurrentQuestion() {

    const current =
        experimentQuestions[
            currentQuestionIndex
        ];


    currentQuestionId =
        current.question_id;

    currentQuestionText =
        current.question_text;

    currentCondition =
        current.condition;


    questionText.textContent =
        currentQuestionText;


    if (currentCondition === "truth") {

        conditionInstruction.textContent =
            "Please answer the question truthfully.";

    } else {

        conditionInstruction.textContent =
            "Please give a false answer to the question.";
    }


    questionProgress.textContent =
        `Question ${currentQuestionIndex + 1} of ${TOTAL_QUESTIONS}`;


    textInput.value = "";

    textInput.style.display = "";

    characterCountElement.style.display = "";

    submitButton.style.display = "";

    updateCharacterCount();

    resetTypingTracker();


    // IMPORTANT:
    // The textarea is NOT automatically focused.
    // The participant must click it themselves.
}


// ============================================
// INITIALIZE EXPERIMENT
// ============================================

async function initializeExperiment() {

    try {

        questionProgress.textContent =
            "Loading...";


        // ----------------------------------------
        // GET QUESTIONS FROM SUPABASE
        // ----------------------------------------

        const {
            data,
            error
        } = await supabaseClient
            .from("questions")
            .select(
                "question_id, question_text"
            );


        if (error) {
            throw error;
        }


        if (
            !data ||
            data.length < TOTAL_QUESTIONS
        ) {

            throw new Error(
                `Not enough questions available. At least ${TOTAL_QUESTIONS} are required.`
            );
        }


        // ----------------------------------------
        // GET NEXT PARTICIPANT ID
        // ----------------------------------------
        //
        // Supabase generates:
        // 1, 2, 3, 4, ...
        //
        // The same ID is used for all
        // 4 responses from this participant.
        // ----------------------------------------

        const {
            data: newParticipantId,
            error: participantError
        } = await supabaseClient.rpc(
            "get_next_participant_id"
        );


        if (participantError) {
            throw participantError;
        }


        participantId =
            newParticipantId;


        // ----------------------------------------
        // SELECT RANDOM QUESTIONS
        // ----------------------------------------

        const selectedQuestions =
            shuffle(data).slice(
                0,
                TOTAL_QUESTIONS
            );


        // ----------------------------------------
        // EXACTLY 2 TRUTH + 2 LIE
        // ----------------------------------------

        const conditions = [
            "truth",
            "truth",
            "lie",
            "lie"
        ];


        // ----------------------------------------
        // ASSIGN CONDITIONS
        // ----------------------------------------

        let questionPairs =
            selectedQuestions.map(
                (question, index) => {

                    return {

                        question_id:
                            question.question_id,

                        question_text:
                            question.question_text,

                        condition:
                            conditions[index]
                    };
                }
            );


        // ----------------------------------------
        // RANDOMIZE QUESTION ORDER
        // ----------------------------------------

        questionPairs =
            shuffle(questionPairs);


        experimentQuestions =
            questionPairs;


        // ----------------------------------------
        // DEBUG INFORMATION
        // ----------------------------------------

        console.log(
            "Participant ID:",
            participantId
        );

        console.log(
            "Experiment Questions:",
            experimentQuestions
        );


        // ----------------------------------------
        // SHOW FIRST QUESTION
        // ----------------------------------------

        displayCurrentQuestion();


    } catch (error) {

        console.error(
            "Error initializing experiment:",
            error
        );


        questionProgress.textContent =
            "Unable to load questions.";

        questionText.textContent =
            "Please refresh the page and try again.";

        conditionInstruction.textContent =
            "";

        textInput.disabled = true;

        submitButton.disabled = true;
    }
}


// ============================================
// KEYBOARD TRACKING
// ============================================

textInput.addEventListener(
    "keydown",
    function (event) {

        // ----------------------------------------
        // IGNORE NON-TYPING KEYS
        // ----------------------------------------

        if (!isTypingKey(event)) {
            return;
        }


        const currentTime =
            performance.now();


        // ----------------------------------------
        // FIRST TYPING KEY
        // ----------------------------------------

        if (firstKeyTime === null) {

            firstKeyTime =
                currentTime;


            burstStartTime =
                currentTime;


            currentBurstKeystrokes = 0;
        }


        // ----------------------------------------
        // CALCULATE PAUSE
        // ----------------------------------------

        if (
            previousTypingKeyTime !== null
        ) {

            const interval =
                currentTime -
                previousTypingKeyTime;


            if (
                interval >=
                PAUSE_THRESHOLD
            ) {

                pauses.push(interval);


                // --------------------------------
                // FINISH PREVIOUS BURST
                // --------------------------------

                if (
                    burstStartTime !== null
                ) {

                    const burstDuration =
                        previousTypingKeyTime -
                        burstStartTime;


                    burstDurations.push(
                        burstDuration
                    );


                    burstKeystrokes.push(
                        currentBurstKeystrokes
                    );
                }


                // --------------------------------
                // START NEW BURST
                // --------------------------------

                burstStartTime =
                    currentTime;


                currentBurstKeystrokes = 0;
            }
        }


        // ----------------------------------------
        // COUNT KEYSTROKE
        // ----------------------------------------

        keystrokeCount++;

        currentBurstKeystrokes++;


        // ----------------------------------------
        // COUNT BACKSPACE
        // ----------------------------------------

        if (event.key === "Backspace") {

            backspaceCount++;
        }


        // ----------------------------------------
        // UPDATE TIMES
        // ----------------------------------------

        previousTypingKeyTime =
            currentTime;

        lastKeyTime =
            currentTime;
    }
);


// ============================================
// SUBMIT RESPONSE
// ============================================

submitButton.addEventListener(
    "click",
    async function () {

        // Prevent double submission
        submitButton.disabled = true;


        try {

            const submitTime =
                performance.now();


            // ------------------------------------
            // GET RESPONSE TEXT
            // ------------------------------------

            const responseText =
                textInput.value.trim();


            // ------------------------------------
            // RESPONSE TIME
            //
            // Question displayed -> submission
            //
            // Convert milliseconds to seconds.
            // ------------------------------------

            const responseTime =
                (
                    submitTime -
                    startTime
                ) / 1000;


            // ------------------------------------
            // FIRST KEY DELAY
            //
            // Question displayed -> first key
            //
            // Convert milliseconds to seconds.
            // ------------------------------------

            let firstKeyDelay = 0;


            if (firstKeyTime !== null) {

                firstKeyDelay =
                    (
                        firstKeyTime -
                        startTime
                    ) / 1000;
            }


            // ------------------------------------
            // TYPING DURATION
            //
            // First key -> last key
            //
            // Convert milliseconds to seconds.
            // ------------------------------------

            let typingDuration = 0;


            if (
                firstKeyTime !== null &&
                lastKeyTime !== null
            ) {

                typingDuration =
                    (
                        lastKeyTime -
                        firstKeyTime
                    ) / 1000;
            }


            // ------------------------------------
            // FINALIZE LAST BURST
            // ------------------------------------

            if (
                burstStartTime !== null &&
                lastKeyTime !== null
            ) {

                const finalBurstDuration =
                    lastKeyTime -
                    burstStartTime;


                burstDurations.push(
                    finalBurstDuration
                );


                burstKeystrokes.push(
                    currentBurstKeystrokes
                );
            }


            // ------------------------------------
            // CHARACTER COUNT
            // ------------------------------------

            const characters =
                responseText.length;


            // ------------------------------------
            // WORD COUNT
            // ------------------------------------

            const words =
                responseText.length === 0
                    ? 0
                    : responseText
                        .trim()
                        .split(/\s+/)
                        .length;


            // ------------------------------------
            // TYPING SPEED
            //
            // Words per minute.
            // ------------------------------------

            let typingSpeed = 0;


            if (typingDuration > 0) {

                typingSpeed =
                    (
                        words /
                        typingDuration
                    ) * 60;
            }


            // ------------------------------------
            // PAUSE METRICS
            //
            // pauses[] is stored in milliseconds.
            // Convert to seconds here.
            // ------------------------------------

            const pauseCount =
                pauses.length;


            let longestPause = 0;

            let averagePause = 0;


            if (pauses.length > 0) {

                longestPause =
                    Math.max(
                        ...pauses
                    ) / 1000;


                averagePause =
                    (
                        pauses.reduce(
                            (
                                sum,
                                pause
                            ) =>
                                sum + pause,
                            0
                        ) /
                        pauses.length
                    ) / 1000;
            }


            // ------------------------------------
            // REVISION RATE
            // ------------------------------------

            let revisionRate = 0;


            if (keystrokeCount > 0) {

                revisionRate =
                    (
                        backspaceCount /
                        keystrokeCount
                    ) * 100;
            }


            // ------------------------------------
            // BURST METRICS
            //
            // burstDurations[] is stored in
            // milliseconds.
            //
            // Convert to seconds here.
            // ------------------------------------

            let averageBurstDuration = 0;

            let longestBurstDuration = 0;

            let keystrokesPerBurst = 0;


            if (
                burstDurations.length > 0
            ) {

                averageBurstDuration =
                    (
                        burstDurations.reduce(
                            (
                                sum,
                                duration
                            ) =>
                                sum + duration,
                            0
                        ) /
                        burstDurations.length
                    ) / 1000;


                longestBurstDuration =
                    Math.max(
                        ...burstDurations
                    ) / 1000;


                const totalBurstKeystrokes =
                    burstKeystrokes.reduce(
                        (
                            sum,
                            count
                        ) =>
                            sum + count,
                        0
                    );


                keystrokesPerBurst =
                    totalBurstKeystrokes /
                    burstKeystrokes.length;
            }


            // ------------------------------------
            // DEVICE TYPE
            // ------------------------------------

            const deviceType =
                getDeviceType();


            // ------------------------------------
            // PREPARE DATA FOR SUPABASE
            //
            // All decimal values are rounded
            // to exactly 3 decimal places.
            // ------------------------------------

            const responseData = {

                participant_id:
                    participantId,

                question_id:
                    currentQuestionId,

                condition:
                    currentCondition,

                response_time:
                    roundTo3(
                        responseTime
                    ),

                first_key_delay:
                    roundTo3(
                        firstKeyDelay
                    ),

                typing_duration:
                    roundTo3(
                        typingDuration
                    ),

                keystrokes:
                    keystrokeCount,

                backspaces:
                    backspaceCount,

                revision_rate:
                    Number(revisionRate.toFixed(1)),

                characters:
                    characters,

                words:
                    words,

                pause_count:
                    pauseCount,

                longest_pause:
                    roundTo3(
                        longestPause
                    ),

                average_pause:
                    roundTo3(
                        averagePause
                    ),

                typing_speed:
                    roundTo3(
                        typingSpeed
                    ),

                average_burst_duration:
                    roundTo3(
                        averageBurstDuration
                    ),

                longest_burst_duration:
                    roundTo3(
                        longestBurstDuration
                    ),

                keystrokes_per_burst:
                    roundTo3(
                        keystrokesPerBurst
                    ),

                device_type:
                    deviceType
            };


            // ------------------------------------
            // DEBUG INFORMATION
            // ------------------------------------

            console.log(
                "Response being saved:",
                responseData
            );


            // ------------------------------------
            // SAVE TO SUPABASE
            // ------------------------------------

            const { error } =
                await supabaseClient
                    .from("typing_responses")
                    .insert([
                        responseData
                    ]);


            if (error) {

                console.error(
                    "Supabase insert error:",
                    error
                );


                alert(
                    "There was an error saving your response. Please try again."
                );


                submitButton.disabled =
                    false;


                return;
            }


            console.log(
                "Response saved successfully."
            );


            // ------------------------------------
            // MOVE TO NEXT QUESTION
            // ------------------------------------

            currentQuestionIndex++;


            if (
                currentQuestionIndex <
                TOTAL_QUESTIONS
            ) {

                displayCurrentQuestion();

                submitButton.disabled =
                    false;


            } else {

                // --------------------------------
                // EXPERIMENT COMPLETE
                // --------------------------------

                pageTitle.textContent =
                    "Thank you for participating!";


                questionProgress.style.display =
                    "none";


                questionText.style.display =
                    "none";


                conditionInstruction.style.display =
                    "none";


                textInput.style.display =
                    "none";


                characterCountElement.style.display =
                    "none";


                submitButton.style.display =
                    "none";


                completionMessage.style.display =
                    "block";


                console.log(
                    "Participant completed:",
                    participantId
                );
            }


        } catch (error) {

            console.error(
                "Unexpected error:",
                error
            );


            alert(
                "Something went wrong. Please try again."
            );


            submitButton.disabled =
                false;
        }
    }
);


// ============================================
// START
// ============================================

initializeExperiment();