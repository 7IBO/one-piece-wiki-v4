# Fandom structural analysis — https://onepiece.fandom.com

Generated: 2026-09-08T21:50:13.804Z

## Overview

- 2648 categories (27 matched to an entity type)
- 39 infobox templates (13 with a mapper)
- 38 entity types in our catalogue

## Infoboxes

| Template                | Mapper       | Entity type         | Transclusions (≤500) | Fields mapped/ignored/unmapped |
| ----------------------- | ------------ | ------------------- | -------------------: | ------------------------------ |
| Chapter Box             | chapter      | manga-chapter       |                  500 | 8/0/4                          |
| Char Box                | character    | character           |                  500 | 0/0/0                          |
| Episode Box             | episode      | anime-episode       |                  500 | 6/1/25                         |
| Scroll Box              | —            | —                   |                  500 | 0/0/1                          |
| Island Box              | —            | —                   |                  414 | 0/0/10                         |
| Simple Box              | —            | —                   |                  265 | 0/0/26                         |
| Devil Fruit Box         | devil-fruit  | devil-fruit         |                  211 | 9/3/0                          |
| Song Box                | —            | —                   |                  207 | 0/0/11                         |
| Crew Box                | crew         | crew                |                  149 | 10/3/0                         |
| Ship Box                | ship         | ship                |                  141 | 10/3/0                         |
| Message Box             | —            | —                   |                  137 | 0/0/2                          |
| Volume Box              | volume       | volume              |                  115 | 4/0/1                          |
| Organization Box        | organization | organization        |                  114 | 15/1/0                         |
| Weapon Box              | weapon       | weapon              |                  112 | 9/2/0                          |
| Game Box                | —            | —                   |                   87 | 0/0/15                         |
| Spin-Off Chapter Box    | —            | —                   |                   84 | 0/0/13                         |
| Arc Box                 | arc          | arc                 |                   70 | 8/1/0                          |
| Fighting Style Box      | —            | —                   |                   60 | 0/0/9                          |
| Spin-Off Volume Box     | —            | —                   |                   51 | 0/0/17                         |
| Race Box                | —            | race                |                   41 | 0/0/10                         |
| Merch Box               | —            | —                   |                   39 | 0/0/11                         |
| Album Box               | —            | album               |                   31 | 0/0/7                          |
| Movie Box               | —            | —                   |                   28 | 0/0/17                         |
| Event Box               | —            | event               |                   26 | 0/0/20                         |
| Occupation Box          | —            | —                   |                   23 | 0/0/8                          |
| International box       | —            | —                   |                   19 | 0/0/10                         |
| Live-Action Episode Box | —            | live-action-episode |                   16 | 0/0/11                         |
| Scroll box              | —            | —                   |                   13 | 0/0/1                          |
| Manga Box               | —            | —                   |                   12 | 0/0/14                         |
| Saga Box                | —            | saga                |                   11 | 0/0/7                          |
| OVA Box                 | —            | —                   |                    3 | 0/0/19                         |
| Animanga Box            | —            | —                   |                    2 | 0/0/18                         |
| Facebook box            | —            | —                   |                    1 | 0/0/0                          |
| Game box                | —            | —                   |                    1 | 0/0/7                          |
| Ship box                | ship         | ship                |                    1 | 5/2/0                          |
| Article Message Box     | —            | —                   |                    0 | 0/0/0                          |
| Crew box                | crew         | crew                |                    0 | 0/0/0                          |
| Fighting Style box      | —            | —                   |                    0 | 0/0/0                          |
| Weapon box              | weapon       | weapon              |                    0 | 0/0/0                          |

## Field inventory

Value shapes across the sampled pages — the input for schema work. `enum_like` means few distinct values over many pages (a vocabulary candidate); `wikilink` / `wikilink_list` mean the field points at other entities (a relation candidate, not a string property); `template` means the value needs its own parser.

### Chapter Box → `manga-chapter`

| Field    | Handling | Shape                              | Examples                                                                                                                                                          |
| -------- | -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jname    | mapped   | template (100% filled, 6 distinct) | `{{Ruby\|MONSTER TIME\|モンスター タイム}}`<br>`{{Ruby\|OBAHAN TIME\|オバハン タイム}}`<br>`{{Ruby\|REPORT TIME\|リポート タイム}}`<br>`びっくり箱`<br>`仁義ない` |
| page     | mapped   | number (100% filled, 2 distinct)   | `19`<br>`3`                                                                                                                                                       |
| rname    | mapped   | text (100% filled, 6 distinct)     | `Jingi-nai Taimu`<br>`Ai no Kobushi`<br>`Monsutā Taimu`<br>`Bikkuri Bako`<br>`Obahan Taimu`                                                                       |
| title    | mapped   | text (100% filled, 6 distinct)     | `Jack-in-the-Box`<br>`No Honor Time`<br>`Fist of Love`<br>`Monster Time`<br>`Obahan Time`                                                                         |
| anime    | mapped   | date (67% filled, 4 distinct)      | `Episode 280`<br>`Episode 281`<br>`Episode 282`<br>`Episode 283`                                                                                                  |
| chapter  | mapped   | date (67% filled, 4 distinct)      | `Straw Hat Theater 1`<br>`Straw Hat Theater 2`<br>`Straw Hat Theater 3`<br>`Straw Hat Theater 5`                                                                  |
| date2    | unmapped | date (67% filled, 4 distinct)      | `December 30, 2005`<br>`February 28, 2006`<br>`November 30, 2005`<br>`May 2, 2006`                                                                                |
| image    | unmapped | text (67% filled, 4 distinct)      | `No Honor Time.png`<br>`Monster Time.png`<br>`Obahan Time.png`<br>`Report Time.png`                                                                               |
| next     | unmapped | wikilink (67% filled, 4 distinct)  | `No Honor Time`<br>`Chopper Man`<br>`Obahan Time`<br>`Space Time`                                                                                                 |
| vol      | mapped   | wikilink (67% filled, 1 distinct)  | `Straw Hat Grand Theater`                                                                                                                                         |
| previous | unmapped | wikilink (50% filled, 3 distinct)  | `Chopper Man`<br>`Obahan Time`<br>`Report Time`                                                                                                                   |
| ename    | mapped   | text (33% filled, 2 distinct)      | `Jack-in-the-Box`<br>`Fist of Love`                                                                                                                               |

### Episode Box → `anime-episode`

| Field           | Handling | Shape                                         | Examples                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #               | mapped   | date (100% filled, 6 distinct)                | `Special 4`<br>`131`<br>`288`<br>`289`<br>`290`                                                                                                                                                                                                                                                                                                                                                             |
| Ed              | mapped   | template (100% filled, 6 distinct)            | `{{宇田鋼之介}}`<br>`{{上田芳裕}}`<br>`{{池田洋子}}`<br>`{{角銅博之}}`<br>`{{遠藤勇二}}`                                                                                                                                                                                                                                                                                                                    |
| Kanji           | unmapped | template (100% filled, 6 distinct)            | `年末特別企画！麦わらの ルフィ親分捕物帖`<br>`制御不能！チョッパー禁断のランブル！`<br>`ゾロ新技炸裂！刀の名はそげキング?`<br>`フクロウの誤算！俺のコーラは命の水`<br>`はじめての！ランブルボール秘話`                                                                                                                                                                                                      |
| rank            | unmapped | text (100% filled, 5 distinct)                | `6 - Original 10 - Remastered`<br>`1`<br>`4`<br>`8`<br>`9`                                                                                                                                                                                                                                                                                                                                                  |
| rating          | ignored  | text (100% filled, 6 distinct)                | `12.4 - Original 4.1 - Remastered`<br>`11.6`<br>`15.0`<br>`5.1`<br>`7.3`                                                                                                                                                                                                                                                                                                                                    |
| Romaji          | unmapped | text (100% filled, 6 distinct)                | `Nenmatsu Tokubetsu Kikaku! Mugiwara no Rufi Oyabun Torimonochō`<br>`Zoro Shinwaza sakuretsu! Katana no na wa Sogekingu?`<br>`Fukurō no gosan! Ore no kōra wa inochi no mizu`<br>`Ore wa Rufi! Kaizoku Ō ni naru Otoko da!`<br>`Hajimete no Kuranke! Ranburu Bōru Hiwa`                                                                                                                                     |
| Translation     | mapped   | text (100% filled, 6 distinct)                | `End-Of-Year Special Project! The Detective Memoirs of Chief Straw Hat Luffy`<br>`Zoro's New Technique Explodes! The Katana's Name is Sogeking?`<br>`Fukurou's Miscalculation! My Cola is the Water of Life`<br>`I'm Luffy! The Man Who Will Become the Pirate King!`<br>`The First Patient! Anecdote of the Rumble Ball`                                                                                   |
| Ad              | mapped   | template (83% filled, 5 distinct)             | `{{久田和也}}`<br>`{{井手武生}}`<br>`{{横山健次}}`<br>`{{石塚勝海}}`<br>`{{舘直樹}}`                                                                                                                                                                                                                                                                                                                        |
| Airdate_Funi    | unmapped | text (83% filled, 5 distinct, multi)          | `September 21, 2013 (Simulcast); October 15, 2013 (DVD); February 14, 2015 (Toonami)`<br>`September 21, 2013 (Simulcast); October 15, 2013 (DVD); February 21, 2015 (Toonami)`<br>`September 28, 2013 (Simulcast); October 15, 2013 (DVD); February 28, 2015 (Toonami)`<br>`May 27, 2008 (DVD); October 2, 2012 (Neon Alley)`<br>`May 11, 2010`                                                             |
| Art             | mapped   | template (83% filled, 5 distinct, multi)      | `{{佐藤美幸}}<br/>{{川崎美千代}}`<br>`{{佐藤美幸}}<br/>{{福澤久美子}}`<br>`{{佐藤美幸}}<br/>{{丸森俊昭}}`<br>`{{佐藤美幸}}<br/>{{千田国広}}`<br>`{{吉田智子}}`                                                                                                                                                                                                                                              |
| English         | unmapped | text (83% filled, 5 distinct)                 | `Zoro Busts Out a New Technique! The Sword's Name is Sogeking? (sub); Zoro Busts Out a New Technique! The Sword's Name i…`<br>`Fukurou's Miscalculation! My Cola is the Water of Life!`<br>`The First Patient! The Untold Story of the Rumble Ball!`<br>`I'm Luffy! The Man Who's Gonna Be King of the Pirates!`<br>`Uncontrollable! Chopper's Forbidden Rumble!`                                           |
| eyecatcher      | unmapped | text (83% filled, 4 distinct)                 | `Chopper - Robin`<br>`Chopper - Usopp`<br>`Luffy - Chopper`<br>`Luffy - Luffy`                                                                                                                                                                                                                                                                                                                              |
| Screen          | mapped   | template (83% filled, 4 distinct)             | `{{古賀直樹}}`<br>`{{武上純希}}`<br>`{{島田満}}`<br>`{{菅良幸}}`                                                                                                                                                                                                                                                                                                                                            |
| excredits       | unmapped | enum_like (67% filled, 1 distinct)            | `no`                                                                                                                                                                                                                                                                                                                                                                                                        |
| techDebut       | unmapped | wikilink_list (67% filled, 4 distinct, multi) | `Franky: Franky Destroy Ho; Franky Butterfly; 1.0 Cola Ho Coup de Boo; 70mm Kokei 0.2 Cola Ho Coup de Vent; 70mm Kokei 1…`<br>`Kumadori: Shoka Kyushu; Shigan Cue; Shishi Kebab; Shishi Shigan; Rankyaku "Renge"; Yana Gin Jo Chopper: Heavy Gong; Kok…`<br>`Luffy: Gear 3 Franky: Franky Triangle Jacker; Oyasai Punch Fukurou: Jugon; Fukuro Dataki`<br>`Luffy: Gomu Gomu no Rocket, Gomu Gomu no Pistol` |
| locationDebut   | unmapped | wikilink (33% filled, 2 distinct)             | `Papanapple Island`<br>`Shells Town`                                                                                                                                                                                                                                                                                                                                                                        |
| 4number         | unmapped | number (17% filled, 1 distinct)               | `1`                                                                                                                                                                                                                                                                                                                                                                                                         |
| Airdate         | unmapped | date (17% filled, 1 distinct)                 | `December 18, 2005`                                                                                                                                                                                                                                                                                                                                                                                         |
| Airdate_4       | unmapped | date (17% filled, 1 distinct)                 | `September 18, 2004`                                                                                                                                                                                                                                                                                                                                                                                        |
| Airdate_RM      | unmapped | date (17% filled, 1 distinct)                 | `April 7, 2012`                                                                                                                                                                                                                                                                                                                                                                                             |
| chapter         | unmapped | text (17% filled, 1 distinct)                 | `Filler`                                                                                                                                                                                                                                                                                                                                                                                                    |
| charDebut       | unmapped | wikilink_list (17% filled, 1 distinct, multi) | `Shiro, Tomeo, Nami, Alvida, Koby, Heppoko, Peppoko, Poppoko, Monkey D. Luffy, Roronoa Zoro`                                                                                                                                                                                                                                                                                                                |
| devilfruitDebut | unmapped | wikilink (17% filled, 1 distinct)             | `Gomu Gomu no Mi`                                                                                                                                                                                                                                                                                                                                                                                           |
| Ending          | unmapped | wikilink (17% filled, 1 distinct)             | `Family`                                                                                                                                                                                                                                                                                                                                                                                                    |
| English4        | unmapped | text (17% filled, 1 distinct)                 | `I’m Gonna Be King of the Pirates!`                                                                                                                                                                                                                                                                                                                                                                         |
| EnglishOdex     | unmapped | text (17% filled, 1 distinct)                 | `Luffy, the Future King of Pirates`                                                                                                                                                                                                                                                                                                                                                                         |
| format          | unmapped | text (17% filled, 1 distinct)                 | `16:9 (HDTV)`                                                                                                                                                                                                                                                                                                                                                                                               |
| N               | unmapped | number (17% filled, 1 distinct)               | `254`                                                                                                                                                                                                                                                                                                                                                                                                       |
| Opening         | unmapped | wikilink (17% filled, 1 distinct)             | `Kokoro no Chizu`                                                                                                                                                                                                                                                                                                                                                                                           |
| P               | unmapped | number (17% filled, 1 distinct)               | `253`                                                                                                                                                                                                                                                                                                                                                                                                       |
| Season          | unmapped | text (0% filled, 0 distinct)                  |                                                                                                                                                                                                                                                                                                                                                                                                             |
| toeiTitle       | unmapped | template (17% filled, 1 distinct)             | `One Piece Historical Drama Series: Luffy's Detective Story`                                                                                                                                                                                                                                                                                                                                                |

### Scroll Box

| Field   | Handling | Shape                                          | Examples                                                                                                                   |
| ------- | -------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| content | unmapped | wikilink_list (100% filled, 1 distinct, multi) | `* *One Piece: Unlimited Adventure *One Piece: Unlimited Cruise *One Piece: Gear Spirit *One Piece: Gigant Battle! 2 New…` |

### Island Box

| Field       | Handling | Shape                                          | Examples                                                                                                                                                                                                                                       |
| ----------- | -------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| colorscheme | unmapped | text (100% filled, 6 distinct)                 | `WorldGovernmentColors`<br>`IlusiaKingdomColors`<br>`EniesLobbyColors`<br>`SkypieansColors`<br>`ArabastaColors`                                                                                                                                |
| first       | unmapped | wikilink_list (100% filled, 6 distinct, multi) | `Chapter 395; Episode 277 (mentioned)`<br>`Chapter 239; Episode 154`<br>`Chapter 358; Episode 263`<br>`Chapter 823; Episode 777`<br>`Chapter 113; Episode 78`                                                                                  |
| jname       | unmapped | text (100% filled, 6 distinct)                 | `アラバスタ王国`<br>`エニエスロビー`<br>`イリシア王国`<br>`マリージョア`<br>`スカイピア`                                                                                                                                                       |
| rname       | unmapped | text (100% filled, 6 distinct)                 | `Arabasuta Ōkoku`<br>`Kyodaina Ōkoku`<br>`Irishia Ōkoku`<br>`Eniesu Robī`<br>`Sukaipia`                                                                                                                                                        |
| region      | unmapped | template (83% filled, 4 distinct)              | `West Blue`<br>`Paradise`<br>`Red Line`<br>`Sky`                                                                                                                                                                                               |
| affiliation | unmapped | wikilink_list (67% filled, 2 distinct)         | `World Government; Marines`<br>`World Government`                                                                                                                                                                                              |
| ename       | unmapped | text (67% filled, 4 distinct, multi)           | `Mary Geoise (OPCG, Crunchyroll, Live-Action) Marijoa (VIZ, formerly Crunchyroll) Mariejois (Funimation) Eden Rock (4Kid…`<br>`Alabasta Kingdom; Arabasta (Odex); Alabaster (One Piece: Unlimited Adventure)`<br>`Immense Kingdom`<br>`Ilisia` |
| type        | unmapped | template (33% filled, 2 distinct)              | `Afternoon/Never-night Island`<br>`Summer Island`                                                                                                                                                                                              |
| image       | unmapped | text (17% filled, 1 distinct)                  | `Ilisia Kingdom Ship.png`                                                                                                                                                                                                                      |
| population  | unmapped | number (17% filled, 1 distinct)                | `10,000,000`                                                                                                                                                                                                                                   |

### Simple Box

| Field       | Handling | Shape                                         | Examples                                                                                                                                                                                                                             |
| ----------- | -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| colorscheme | unmapped | text (100% filled, 5 distinct)                | `PirateCrewDefaultColors`<br>`RogerPiratesColors`<br>`RealWorldColors`<br>`HistoryColors`<br>`WillOfDColors`                                                                                                                         |
| jname       | unmapped | template (83% filled, 5 distinct)             | `{{Ruby\|ひとつなぎの大秘宝\|ワンピース}}`<br>`空白の100年`<br>`尾田栄一郎`<br>`の意志`<br>`懸賞金`                                                                                                                                  |
| rname       | unmapped | text (83% filled, 5 distinct)                 | `Kūhaku no Hyaku-nen`<br>`Oda Eiichirō`<br>`Dī no Ishi`<br>`Kenshōkin`<br>`Wan Pīsu`                                                                                                                                                 |
| ename       | unmapped | text (67% filled, 4 distinct, multi)          | `Will of D (Odex, Funimation, VIZ); Gol D.'s Spirit (4Kids); Will of "D." (VIZ, former); Spirit of D (Funimation dub, fo…`<br>`Void Century (VIZ) 100-Year Void (VIZ, former) Blank Century (Funimation)`<br>`One Piece`<br>`Bounty` |
| first       | unmapped | template (67% filled, 4 distinct, multi)      | `Chapter 1; Episode 48,000,000 bounty. Later, Shanks mockingly reminds him of this fact.}}`<br>`Chapter 2; Episode 1 (mentioned)`<br>`Chapter 1; Episode 1`<br>`N/A`                                                                 |
| extra1      | unmapped | template (50% filled, 3 distinct)             | `January 1, 1975 (age - 1975 }})`<br>`October 20, 1999 - Ongoing`<br>`Prize Money`                                                                                                                                                   |
| extra1title | unmapped | text (50% filled, 3 distinct)                 | `Literal Meaning`<br>`Original run`<br>`Born`                                                                                                                                                                                        |
| extra2      | unmapped | template (50% filled, 3 distinct)             | `Joy Boy (former) Gol D. Roger (former)`<br>`{{W\|Manga artist\|Mangaka}}`<br>`{{Count/episodes}}`                                                                                                                                   |
| extra2title | unmapped | text (50% filled, 3 distinct)                 | `Occupation`<br>`Episodes`<br>`Owner`                                                                                                                                                                                                |
| extra3      | unmapped | text (33% filled, 2 distinct)                 | `Action, Adventure, Fantasy, Drama`<br>`1992-present`                                                                                                                                                                                |
| extra3title | unmapped | text (33% filled, 2 distinct)                 | `Years Active`<br>`Genre`                                                                                                                                                                                                            |
| extra4      | unmapped | wikilink_list (33% filled, 2 distinct, multi) | `One Piece Wanted!`<br>`Toei Animation`                                                                                                                                                                                              |
| extra4title | unmapped | text (33% filled, 2 distinct, multi)          | `Production company`<br>`Works`                                                                                                                                                                                                      |
| extra5      | unmapped | template (33% filled, 2 distinct, multi)      | `{{Nihongo\|"Odacchi"\|オダッチ}}<br />{{Nihongo\|"Ei-chan"\|栄ちゃん}}`<br>`{{W\|Fuji Television}}`                                                                                                                                 |
| extra5title | unmapped | text (33% filled, 2 distinct, multi)          | `Original network`<br>`Nickname(s)`                                                                                                                                                                                                  |
| extra6      | unmapped | wikilink_list (33% filled, 2 distinct, multi) | `*Crunchyroll *Netflix *Prime Video *Hulu **Disney+ *Vudu *Pluto TV *Apple TV *Sling TV *Daisuki *YouTube *BBC iPlayer (…`<br>`172 cm (5'8")`                                                                                        |
| extra6title | unmapped | text (33% filled, 2 distinct)                 | `Official streaming sites`<br>`Height`                                                                                                                                                                                               |
| image       | unmapped | text (33% filled, 2 distinct)                 | `Great Kingdom Vs Ancient Alliance.png`<br>`One Piece Anime Logo.png`                                                                                                                                                                |
| extra7      | unmapped | template (17% filled, 1 distinct)             | `{{W\|Blood type personality theory\|A}}`                                                                                                                                                                                            |
| extra7title | unmapped | text (17% filled, 1 distinct)                 | `Blood Type`                                                                                                                                                                                                                         |
| extra8      | unmapped | template (17% filled, 1 distinct)             | `{{Nihongo\|Chiaki Inaba\|稲葉ちあき\|Inaba Chiaki}}`                                                                                                                                                                                |
| extra8title | unmapped | text (17% filled, 1 distinct)                 | `Spouse`                                                                                                                                                                                                                             |
| extra9      | unmapped | wikilink (17% filled, 1 distinct)             | `100px`                                                                                                                                                                                                                              |
| extra9title | unmapped | text (17% filled, 1 distinct)                 | `Signature`                                                                                                                                                                                                                          |
| imagename   | unmapped | text (17% filled, 1 distinct)                 | `Great Kingdom`                                                                                                                                                                                                                      |
| name        | unmapped | text (17% filled, 1 distinct)                 | `One Piece`                                                                                                                                                                                                                          |

### Devil Fruit Box → `devil-fruit`

| Field     | Handling | Shape                                          | Examples                                                                                                                                                                                                                                                                                           |
| --------- | -------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| backcolor | ignored  | text (100% filled, 6 distinct)                 | `2D0B33`<br>`33333F`<br>`746bbc`<br>`F26B8A`<br>`FAF1F4`                                                                                                                                                                                                                                           |
| ename     | mapped   | text (100% filled, 6 distinct, multi)          | `Bomb-Bomb Fruit (4Kids, Funimation, Odex); Boom-Boom Fruit (Viz)`<br>`Slip-Slip Fruit (Viz, 4Kids); Smooth-Smooth Fruit (Funimation)`<br>`Chop-Chop Fruit The Fruit of Dismemberment (Odex)`<br>`Gum-Gum Fruit ----Human-Human Fruit, Model: Nika`<br>`Kilo-Kilo Fruit; Pound-Pound Fruit (Odex)` |
| first     | mapped   | wikilink_list (100% filled, 6 distinct, multi) | `Chapter 51 (cover); Episode 46`<br>`Chapter 426; Episode 309`<br>`Chapter 110; Episode 65`<br>`Chapter 112; Episode 66`<br>`Chapter 1; Episode 1`                                                                                                                                                 |
| jname     | mapped   | text (100% filled, 6 distinct)                 | `ゴムゴムの実 ----ヒトヒトの実 モデル「ニカ」`<br>`キロキロの実`<br>`スベスベの実`<br>`バラバラの実`<br>`ベリベリの実`                                                                                                                                                                             |
| meaning   | mapped   | text (100% filled, 6 distinct)                 | `Rubber ----Human; Nika`<br>`Scattered; in pieces`<br>`Kilo from Kilogram`<br>`Smooth`<br>`Berry`                                                                                                                                                                                                  |
| textcolor | ignored  | text (100% filled, 6 distinct)                 | `B6CE87`<br>`DA7395`<br>`DAD5B9`<br>`E4A330`<br>`E6EBEC`                                                                                                                                                                                                                                           |
| type      | mapped   | wikilink_list (100% filled, 2 distinct)        | `Paramecia ----Mythical Zoan`<br>`Paramecia`                                                                                                                                                                                                                                                       |
| user      | mapped   | template (100% filled, 6 distinct)             | `Monkey D. Luffy`<br>`Very Good`<br>`Alvida`<br>`Mikita`<br>`Buggy`                                                                                                                                                                                                                                |
| fruit     | mapped   | wikilink_list (83% filled, 4 distinct)         | `One Piece Magazine Vol.10`<br>`One Piece Magazine Vol.11`<br>`Chapter 19; Episode 8`<br>`Chapter 1; Episode 4`                                                                                                                                                                                    |
| previous  | mapped   | template (33% filled, 2 distinct)              | `Joy Boy`<br>`Ganzui`                                                                                                                                                                                                                                                                              |
| rname     | mapped   | text (17% filled, 1 distinct)                  | `Gomu Gomu no Mi ----Hito Hito no Mi Moderu Nika`                                                                                                                                                                                                                                                  |
| title     | ignored  | text (17% filled, 1 distinct, multi)           | `Gomu Gomu no Mi (Hito Hito no Mi, Model: Nika)`                                                                                                                                                                                                                                                   |

### Song Box

| Field   | Handling | Shape                                         | Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------- | -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Singer  | unmapped | template (100% filled, 6 distinct)            | `Shawn Conrad, Russell Velàsquez`<br>`{{W\|Hiroshi Kitadani}}`<br>`{{W\|Bon-Bon Blanco}}`<br>`Straw Hat Pirates`<br>`Nami and Robin`                                                                                                                                                                                                                                                                                                                                                                                     |
| Use     | unmapped | prose (100% filled, 6 distinct, multi)        | `Opening: Episodes 1 - 47 (47 episodes), Emergency Planning, Movie 1, and Episode 1000 Insert: Episodes 129 and 152 (2 e…`<br>`Character Image songs Ending: Episode 128 (6-member version) Episode Specials 2–4 and Recap 2 (7-member version) Insert…`<br>`"I'm Gonna Be King of the Pirates" - "The Great Escape!" (104 episodes, 4Kids dub)`<br>`4th Opening: Episode 169 - 206 (38 episodes) and Episode Special 3 and Recap 2`<br>`Episodes 264 - 278 (15 episodes) Insert: Episode of Merry (Japanese broadcast)` |
| Album   | unmapped | text (83% filled, 5 distinct)                 | `One Piece - Ocean's Dream (6-member version) ----One Piece - Best Album 2 (7-member version)`<br>`Character Song Carnival`<br>`We Are! (ウィーアー!)`<br>`Brand New World`<br>`Bon Voyage!`                                                                                                                                                                                                                                                                                                                             |
| Length  | unmapped | text (83% filled, 5 distinct, multi)          | `1:49 (opening) 4:00 (full)`<br>`3:56; 1:50 (opening)`<br>`4:30; 1:50 (opening)`<br>`1:00`<br>`4:02`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Label   | unmapped | template (50% filled, 2 distinct)             | `{{W\|Nippon Columbia\|Columbia Music Entertainment}}`<br>`Pony Canyon`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Next    | unmapped | text (67% filled, 4 distinct)                 | `We Are!#Straw Hat Versions`<br>`Kokoro no Chizu`<br>`Moulin Rouge`<br>`Believe`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Image   | unmapped | text (50% filled, 3 distinct)                 | `280px\|Hurricane Girls' CD cover`<br>`One Piece Oceans of Dreams.png`<br>`Group-BON YOAGE!.png`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Pre     | unmapped | text (50% filled, 3 distinct)                 | `Kokoro no Chizu`<br>`Hikari e`<br>`Friends`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Website | unmapped | text (17% filled, 1 distinct)                 | `N/A`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| chapter | unmapped | wikilink_list (33% filled, 2 distinct, multi) | `Chapter 254 (p. 1-2); Chapter 274 (p. 1-2)`<br>`Chapter 201 (p. 1-2)`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GameUse | unmapped | wikilink_list (33% filled, 2 distinct, multi) | `Grand Battle! Grand Battle! 3 Gigant Battle!`<br>`One Piece: Grand Battle! Rush!`                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Crew Box → `crew`

| Field       | Handling | Shape                                          | Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| bounty      | mapped   | wikilink_list (100% filled, 5 distinct, multi) | `Main Crew: At least 4,194,200,0003,996,000,000 Jesus Burgess - At Least 20,000,000 Shiryu - Unknown Van Augur - At Leas…`<br>`At least 3,320,000,0003,189,000,000 Alvida - 5,000,000 Galdino - 24,000,000 Kinoko - at least 100,000,000 Impel Down es…`<br>`At least 7,000,0007,000,000}} 16,000,0009,000,000 Sham & Buchi - 7,000,000}} 32,000,00016,000,000 Jango - 9,000,000 Sha…`<br>`At least 4,142,900,0004,048,900,000 Benn Beckman - Unknown Lucky Roux - Unknown Yasopp - Unknown Rockstar - 94,000,000}}`<br>`At least 84,000,00025,000,000 Masira Pirates - at least 23,000,000 Shoujou Pirates - at least 36,000,000}}` |
| colorscheme | ignored  | text (100% filled, 5 distinct)                 | `BlackbeardPiratesColors`<br>`SaruyamaAllianceColors`<br>`BlackCatPiratesColors`<br>`RedHairPiratesColors`<br>`BuggyPiratesColors`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ename       | mapped   | text (100% filled, 5 distinct, multi)          | `Monkey Mt. Allies (4Kids); Saruyama Alliance (Funimation); Monkey Mountain Allied Force (VIZ); Monkey Mountain Alliance…`<br>`Black Beard Pirates (Edited dub); Blackbeard Pirates (Uncut dub)`<br>`Red-Haired Pirates (VIZ, 4Kids); Red-Hair Pirates (Funimation)`<br>`Buggy's Band of Pirates`<br>`Black Cat Pirates`                                                                                                                                                                                                                                                                                                             |
| first       | mapped   | wikilink_list (100% filled, 5 distinct, multi) | `Chapter 219; Episode 144`<br>`Chapter 234; Episode 151`<br>`Chapter 25; Episode 10`<br>`Chapter 1; Episode 4`<br>`Chapter 8; Episode 4`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| jname       | mapped   | text (100% filled, 5 distinct)                 | `クロネコ海賊団`<br>`バギー海賊団`<br>`黒ひげ海賊団`<br>`猿山連合軍`<br>`赤髪海賊団`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| jroger      | ignored  | text (100% filled, 5 distinct)                 | `Blackbeard Pirates' Jolly Roger.png`<br>`Saruyama Alliance's Jolly Roger.png`<br>`Black Cat Pirates' Jolly Roger.png`<br>`Red Hair Pirates' Jolly Roger.png`<br>`Buggy Pirates' Jolly Roger.png`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| rname       | mapped   | text (100% filled, 5 distinct)                 | `Akagami Kaizoku-dan`<br>`Kurohige Kaizokudan`<br>`Kuroneko Kaizokudan`<br>`Saruyama Rengō-gun`<br>`Bagī Kaizokudan`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ship        | mapped   | wikilink_list (100% filled, 5 distinct)        | `Victory Hunter; Utan Sonar; Unnamed Third Ship`<br>`Saber of Xebec`<br>`Bezan Black`<br>`Red Force`<br>`Big Top`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| captain     | mapped   | wikilink_list (60% filled, 3 distinct, multi)  | `Buggy; Alvida (former, temporary during Buggy's second absence); Richie (former, temporary during Buggy's first absence)`<br>`Kuro (First Captain, Former); Jango (Second Captain; Former)`<br>`Mont Blanc Cricket`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| extra1      | mapped   | template (40% filled, 2 distinct)              | `Marshall D. Teach`<br>`Shanks`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| extra1title | mapped   | text (40% filled, 2 distinct)                  | `Admiral`<br>`Chief`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| captitle    | ignored  | text (20% filled, 1 distinct)                  | `Captain`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| name        | mapped   | text (20% filled, 1 distinct)                  | `Buggy Pirates`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Ship Box → `ship`

| Field       | Handling | Shape                                          | Examples                                                                                                                                                                                              |
| ----------- | -------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| colorscheme | ignored  | text (100% filled, 5 distinct)                 | `StrawHatPiratesColors`<br>`AncientWeaponsColors`<br>`ArlongPiratesColors`<br>`TomsWorkersColors`<br>`ShipColors`                                                                                     |
| first       | mapped   | wikilink_list (100% filled, 6 distinct, multi) | `Chapter 192; Episode 117 (mentioned)`<br>`Chapter 322; Episode 228`<br>`Chapter 365; Episode 255`<br>`Chapter 41; Episode 17`<br>`Chapter 77; Episode 35`                                            |
| jname       | mapped   | text (100% filled, 6 distinct)                 | `ゴーイング・メリー号`<br>`シャーク・スパーブ号`<br>`パッフィング・トム`<br>`ロケットマン`<br>`プルトン`                                                                                              |
| rname       | mapped   | text (100% filled, 6 distinct)                 | `Shāku Supābu-gō`<br>`Gōingu Merī-gō`<br>`Paffingu Tomu`<br>`Rokettoman`<br>`Puruton`                                                                                                                 |
| affiliation | mapped   | text (83% filled, 5 distinct)                  | `Straw Hat Pirates; Galley-La Company; Franky Family`<br>`Tom's Workers, Water 7`<br>`Straw Hat Pirates`<br>`Arlong Pirates`<br>`Various`                                                             |
| ename       | mapped   | text (83% filled, 5 distinct)                  | `Going Merry (Funimation uncut dub, Odex) Merry Go (VIZ, Funimation edited-for-tv dub) SS Merry Go (4Kids Dub)`<br>`Shark Superb<!-- Treasure Cruise -->`<br>`Puffing Tom`<br>`Rocketman`<br>`Pluton` |
| status      | ignored  | number (67% filled, 2 distinct)                | `1`<br>`2`                                                                                                                                                                                            |
| image       | ignored  | text (17% filled, 1 distinct)                  | `Galley-La Ship.png`                                                                                                                                                                                  |
| birthday    | mapped   | template (17% filled, 1 distinct)              | `January 22nd`                                                                                                                                                                                        |
| Funi eva    | mapped   | template (17% filled, 1 distinct)              | `(Klabautermann)`                                                                                                                                                                                     |
| height      | mapped   | template (17% filled, 1 distinct)              | `1100 cm (36'1")`                                                                                                                                                                                     |
| jva         | mapped   | template (17% filled, 1 distinct)              | `(Klabautermann)`                                                                                                                                                                                     |
| length      | mapped   | template (17% filled, 1 distinct)              | `1300 cm (42'8")`                                                                                                                                                                                     |

### Message Box

| Field | Handling | Shape                          | Examples                             |
| ----- | -------- | ------------------------------ | ------------------------------------ |
| text  | unmapped | text (100% filled, 1 distinct) | `See also the Merchandise FAQ page.` |
| type  | unmapped | text (100% filled, 1 distinct) | `info`                               |

### Volume Box → `volume`

| Field    | Handling | Shape                          | Examples                                                                                                                       |
| -------- | -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| chapters | mapped   | text (100% filled, 6 distinct) | `177 - 186`<br>`317 - 327`<br>`358 - 367`<br>`410 - 419`<br>`420 - 430`                                                        |
| ename    | mapped   | text (100% filled, 6 distinct) | `The City of Water, Water Seven`<br>`The Eleven Supernovas`<br>`Showdown at Alubarna`<br>`Legend of a Hero`<br>`Let's Go Back` |
| jname    | unmapped | text (100% filled, 6 distinct) | `「水の都」ウォーターセブン`<br>`ロケットマン!!`<br>`決戦はアルバーナ`<br>`11人の超新星`<br>`英雄伝説`                         |
| rname    | mapped   | text (100% filled, 6 distinct) | `"Mizu no Miyako" Wōtā Sebun`<br>`Jūichinin no Chōchinsei`<br>`Kessen wa Arubāna`<br>`Eiyū Densetsu`<br>`Rokettoman!!`         |
| title    | mapped   | text (100% filled, 6 distinct) | `The City of Water, Water 7`<br>`The Eleven Supernovas`<br>`Showdown at Alubarna`<br>`Legend of a Hero`<br>`Let's Go Back`     |

### Organization Box → `organization`

| Field          | Handling | Shape                                          | Examples                                                                                                                                                                           |
| -------------- | -------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| colorscheme    | ignored  | text (100% filled, 5 distinct)                 | `Galley-LaCompanyColors`<br>`RevolutionariesColors`<br>`WorldGovernmentColors`<br>`FrankyFamilyColors`<br>`MarinesColors`                                                          |
| ename          | mapped   | text (100% filled, 6 distinct)                 | `Navy (VIZ, 4Kids, edited Funimation dub, Odex); Marines (Funimation, live-action series)`<br>`Revolutionary Army`<br>`Galley-La Company`<br>`World Government`<br>`Franky Family` |
| first          | mapped   | wikilink_list (100% filled, 5 distinct, multi) | `SBS Volume 8 (mentioned) Chapter 142; Episode 91 (shown)`<br>`Chapter 323; Episode 230`<br>`Chapter 324; Episode 230`<br>`Chapter 100; Episode 52`<br>`Chapter 3; Episode 1`      |
| jname          | mapped   | text (100% filled, 6 distinct)                 | `ガレーラカンパニー`<br>`サイファーポール`<br>`フランキー一家`<br>`世界政府`<br>`革命軍`                                                                                           |
| rname          | mapped   | text (100% filled, 6 distinct)                 | `Garēra Kanpanī`<br>`Furankī Ikka`<br>`Kakumei-gun`<br>`Sekai Seifu`<br>`Saifā Pōru`                                                                                               |
| affiliation    | mapped   | template (83% filled, 3 distinct)              | `World Government`<br>`Blue Planet`<br>`Water 7`                                                                                                                                   |
| occupation     | mapped   | template (67% filled, 4 distinct)              | `Global aristocratic totalitarian regime (absolute monarchy)`<br>`Worldwide Investigation Services`<br>`Bounty Hunters; Shipwrights`<br>`Company of Shipwrights`                   |
| leader         | mapped   | wikilink_list (50% filled, 3 distinct)         | `Nerona Imu (King; de facto) Five Elders (Highest Authorities; de jure) World Nobles (Ruling Class) Kong (Commander-in-C…`<br>`Franky (former)`<br>`Iceburg`                       |
| residency      | mapped   | wikilink_list (50% filled, 3 distinct)         | `Kamabakka Kingdom; Baltigo (former)`<br>`Mary Geoise (Capital)`<br>`Franky House`                                                                                                 |
| extra1         | mapped   | wikilink_list (33% filled, 2 distinct, multi)  | `Sakazuki (Current) Sengoku (Former) Kong (Former)`<br>`Monkey D. Dragon`                                                                                                          |
| extra1title    | mapped   | text (33% filled, 2 distinct)                  | `Supreme Commander`<br>`Fleet Admiral`                                                                                                                                             |
| status         | mapped   | text (33% filled, 2 distinct)                  | `Unknown`<br>`Active`                                                                                                                                                              |
| affiliates     | mapped   | wikilink_list (17% filled, 1 distinct, multi)  | `Marines Cipher Pol Seven Warlords of the Sea (formerly) Knights of God Impel Down`                                                                                                |
| bounty         | mapped   | wikilink_list (17% filled, 1 distinct, multi)  | `At least 2,564,000,000Unknown Sabo - At least 602,000,000 Emporio Ivankov - At least 100,000,000 Inazuma - At least 100…`                                                         |
| name           | mapped   | text (17% filled, 1 distinct)                  | `Revolutionary Army`                                                                                                                                                               |
| transportation | mapped   | wikilink_list (17% filled, 1 distinct, multi)  | `Wind Granma, Ships, Carriages`                                                                                                                                                    |

### Weapon Box → `weapon`

| Field       | Handling | Shape                                          | Examples                                                                                                                                                        |
| ----------- | -------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| colorscheme | ignored  | enum_like (100% filled, 3 distinct)            | `AncientWeaponsColors`<br>`SkypieansColors`<br>`SwordsColors`                                                                                                   |
| ename       | mapped   | text (100% filled, 6 distinct)                 | `Night; Yoru (Live-Action)`<br>`Ancient Weapons`<br>`Burn Blade`<br>`Kitetsu I`<br>`Poseidon`                                                                   |
| first       | mapped   | wikilink_list (100% filled, 6 distinct, multi) | `Chapter 612; Episode 531 (Shirahoshi)`<br>`Chapter 233; Episode 151`<br>`Chapter 239, Episode 153`<br>`Chapter 264; Episode 172`<br>`Chapter 612; Episode 531` |
| jname       | mapped   | template (100% filled, 6 distinct)             | `{{Ruby\|燃焼剣\|バーンブレード}}`<br>`{{Ruby\|貝\|ダイアル}}`<br>`ポセイドン`<br>`初代鬼徹`<br>`古代兵器`                                                      |
| type        | mapped   | template (100% filled, 6 distinct)             | `Single-edged greatsword; Black Blade`<br>`Weapons of Mass Destruction`<br>`Dial-powered Sword`<br>`Ancient Weapon`<br>`Cursed Sword`                           |
| rname       | mapped   | text (83% filled, 5 distinct)                  | `Shodai Kitetsu`<br>`Kodai Heiki`<br>`Bān Burēdo`<br>`Poseidon`<br>`Daiaru`                                                                                     |
| meaning     | mapped   | text (67% filled, 4 distinct)                  | `First Generation Ogre/Oni Piercer`<br>`Burning Sword`<br>`Seashell`<br>`Night`                                                                                 |
| owner       | mapped   | wikilink_list (67% filled, 4 distinct, multi)  | `Skypieans, Usopp, God's Army, Shandia, Brook, Golden Lion Pirates`<br>`Kitetsu → Ethanbaron V. Nusjuro`<br>`Aisa, Kamakiri`<br>`Dracule Mihawk`                |
| grade       | mapped   | wikilink_list (33% filled, 1 distinct, multi)  | `Supreme Grade`                                                                                                                                                 |
| price       | mapped   | text (17% filled, 1 distinct)                  | `Varies`                                                                                                                                                        |
| image       | ignored  | wikilink (17% filled, 1 distinct)              | `250px`                                                                                                                                                         |

### Game Box

| Field       | Handling | Shape                                     | Examples                                                                                                                                                                                                                                                                               |
| ----------- | -------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| developer   | unmapped | template (100% filled, 4 distinct)        | `\|archive=https://web.archive.org/web/20090305072349/http://www.cavia.com/jp_web_data/lineup/index.html\|archive-date=200…`<br>`{{W\|Ganbarion}}`<br>`Ganbarion`<br>`Bandai`                                                                                                          |
| genre       | unmapped | text (100% filled, 6 distinct)            | `Action-Adventure, Fighting`<br>`RPG, Fighting`<br>`Fighting`<br>`Action`<br>`Party`                                                                                                                                                                                                   |
| image       | unmapped | text (100% filled, 6 distinct)            | `One Piece Unlimited Adventure Original Cover Art.png`<br>`<gallery> One Piece Pirates Carnival.png`<br>`One Piece Grand Adventure.png`<br>`<Tabber> Japanese = 250px`<br>`Grand Battle 3 Cover.png`                                                                                   |
| platform    | unmapped | template (100% filled, 6 distinct, multi) | `PlayStation 2; Nintendo Gamecube`<br>`Playstation 2 Nintendo GameCube`<br>`PlayStation 2 Nintendo GameCube`<br>`Playstation 2, Gamecube`<br>`Game Boy Advance`                                                                                                                        |
| publisher   | unmapped | template (100% filled, 4 distinct)        | `{{W\|Bandai Namco Entertainment\|Namco Bandai}}`<br>`Namco Bandai Games`<br>`{{W\|Banpresto}}`<br>`Bandai`                                                                                                                                                                            |
| release     | unmapped | text (100% filled, 6 distinct, multi)     | `(JP) March 17, 2005; (USA) September 7, 2005; (EU) September 30, 2005`<br>`(USA) August 29, 2006 (EU) September 22, 2006 (AU) December 8, 2006`<br>`November 23, 2005 (Japan) September 13, 2006 (USA)`<br>`April 26, 2007 (JP) January 22, 2008 (NA)`<br>`December 11, 2003 (Japan)` |
| jname       | unmapped | text (83% filled, 5 distinct)             | `アンリミテッドアドベンチャー`<br>`グラバト! ラッシュ`<br>`グランドバトル! 3`<br>`パイレーツカーニバル`<br>`ナナツ島の大秘宝`                                                                                                                                                          |
| rname       | unmapped | text (83% filled, 5 distinct)             | `Wan Pīsu: Anrimiteddo Adobenchā`<br>`Nanatsu-jima no Dai-hihō`<br>`Paireetsu kānibaru`<br>`Gurando Batoru! 3`<br>`Gurabato! Rasshu`                                                                                                                                                   |
| ename       | unmapped | text (67% filled, 3 distinct)             | `One Piece: Unlimited Adventure`<br>`One Piece: Grand Battle!`<br>`N/A`                                                                                                                                                                                                                |
| next        | unmapped | wikilink (67% filled, 4 distinct)         | `One Piece: Super Grand Battle! X`<br>`One Piece: Grand Battle! Rush!`<br>`One Piece: Unlimited Cruise`<br>`One Piece: Grand Adventure`                                                                                                                                                |
| opening     | unmapped | wikilink (50% filled, 3 distinct)         | `We Are! (Super-EX. Version)`<br>`Kokoro no Chizu`<br>`We Are!`                                                                                                                                                                                                                        |
| previous    | unmapped | wikilink (50% filled, 3 distinct)         | `One Piece: Grand Battle! Rush!`<br>`One Piece: Grand Battle! 3`<br>`Grand Battle! 2`                                                                                                                                                                                                  |
| distributor | unmapped | text (17% filled, 1 distinct, multi)      | `Shueisha Toei Animation 4Kids Entertainment (formerly) Funimation (currently)`                                                                                                                                                                                                        |
| English     | unmapped | text (17% filled, 1 distinct)             | `250px </Tabber>`                                                                                                                                                                                                                                                                      |
| model       | unmapped | text (17% filled, 1 distinct)             | `Multiplayer`                                                                                                                                                                                                                                                                          |

### Spin-Off Chapter Box

| Field    | Handling | Shape                              | Examples                                                                                                                                                             |
| -------- | -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| date     | unmapped | text (100% filled, 6 distinct)     | `September 6, 2021`<br>`April 5th, 2022`<br>`January 4, 2021`<br>`January 4, 2022`<br>`July 19, 2021`                                                                |
| ename    | unmapped | text (100% filled, 6 distinct)     | `Survival! A Peach-Colored Queendom`<br>`The Dawn of Adventure Approaches`<br>`Crooked Cooks, Soba Salvation`<br>`Sanji, Banquet Assistant`<br>`A Beautiful Dessert` |
| jname    | unmapped | template (100% filled, 6 distinct) | `ビューティフル・デザート`<br>`生き抜け!!桃色の王国`<br>`サンジ、助太刀の宴`<br>`冒険の夜明けは迫る`<br>`庖丁無頼蕎麦遣`                                             |
| page     | unmapped | text (100% filled, 5 distinct)     | `35 (Magazine) 36 (Volume)`<br>`31`<br>`33`<br>`39`<br>`50`                                                                                                          |
| rname    | unmapped | text (100% filled, 6 distinct)     | `Ikinuke!! Momoiro no Ōōkoku`<br>`Sanji, Sukedachi no Utage`<br>`Bōken no Yoake wa Semaru`<br>`Hōchō Burai Soba-yarai`<br>`Nami Bāsasu Karifa`                       |
| title    | unmapped | text (100% filled, 6 distinct)     | `Survival! A Peach-Colored Kingdom`<br>`The Dawn of Adventure Approaches`<br>`Crooked Cooks, Soba Salvation`<br>`Sanji, Banquet Assistant`<br>`A Beautiful Dessert`  |
| nocat    | unmapped | number (83% filled, 1 distinct)    | `1`                                                                                                                                                                  |
| wsj      | unmapped | text (83% filled, 5 distinct)      | `2021 Issue 33-34`<br>`2021 Issue 5-6`<br>`2022 Issue 5-6`<br>`2018 Issue 34`<br>`2021 Issue 40`                                                                     |
| chapter  | unmapped | date (17% filled, 1 distinct)      | `Cover Comic 3`                                                                                                                                                      |
| image    | unmapped | text (17% filled, 1 distinct)      | `Nami vs. Kalifa.png`                                                                                                                                                |
| opm      | unmapped | wikilink (17% filled, 1 distinct)  | `Vol.14`                                                                                                                                                             |
| previous | unmapped | wikilink (17% filled, 1 distinct)  | `Vivi's Adventure`                                                                                                                                                   |
| vol      | unmapped | date (17% filled, 1 distinct)      | `One Piece episode A Volume 2`                                                                                                                                       |

### Arc Box → `arc`

| Field      | Handling | Shape                                 | Examples                                                                                                                                                                                                                                                         |
| ---------- | -------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chapter    | mapped   | enum_like (100% filled, 2 distinct)   | `42-68, 27 chapters`<br>`auto`                                                                                                                                                                                                                                   |
| date       | mapped   | text (100% filled, 5 distinct, multi) | `1997-1998 (Manga) 1999 (Anime) 2023 (Live Action)`<br>`1999 (Manga) 2000-2001 (Anime) 2026 (Live Action)`<br>`1997 (Manga) 1999 (Anime) 2023 (Live Action)`<br>`1998 (Manga) 2000 (Anime) 2023 (Live Action)`<br>`1999 (Manga) 2001 (Anime) 2026 (Live Action)` |
| episode    | mapped   | enum_like (100% filled, 1 distinct)   | `auto`                                                                                                                                                                                                                                                           |
| next       | mapped   | wikilink (100% filled, 6 distinct)    | `Reverse Mountain Arc`<br>`Syrup Village Arc`<br>`Arlong Park Arc`<br>`Orange Town Arc`<br>`Whisky Peak Arc`                                                                                                                                                     |
| vol        | mapped   | enum_like (100% filled, 1 distinct)   | `auto`                                                                                                                                                                                                                                                           |
| prev       | mapped   | wikilink (83% filled, 5 distinct)     | `Syrup Village Arc`<br>`Romance Dawn Arc`<br>`Arlong Park Arc`<br>`Orange Town Arc`<br>`Loguetown Arc`                                                                                                                                                           |
| next anime | mapped   | wikilink (17% filled, 1 distinct)     | `Warship Island Arc`                                                                                                                                                                                                                                             |
| prev anime | mapped   | wikilink (33% filled, 2 distinct)     | `Buggy's Crew: After the Battle!`<br>`Warship Island Arc`                                                                                                                                                                                                        |
| image      | ignored  | text (17% filled, 1 distinct)         | `Laboon manga.png`                                                                                                                                                                                                                                               |

### Fighting Style Box

| Field       | Handling | Shape                                          | Examples                                                                                                                                                                               |
| ----------- | -------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| colorscheme | unmapped | enum_like (100% filled, 3 distinct)            | `StrawHatPiratesColors`<br>`FightingStylesColors`<br>`HakiColors`                                                                                                                      |
| ename       | unmapped | template (100% filled, 4 distinct)             | `Three Swords Style, Santoryu (4Kids)`<br>`Six Powers`<br>`Haki`<br>`N/A`                                                                                                              |
| first       | unmapped | wikilink_list (100% filled, 6 distinct, multi) | `Chapter 329; Episode 233`<br>`Chapter 343; Episode 242`<br>`Chapter 23; Episode 9`<br>`Chapter 1; Episode 4`<br>`Chapter 6; Episode 3`                                                |
| focus       | unmapped | template (100% filled, 6 distinct)             | `Various Weapons and Psychological Tactics`<br>`Technique specific, superhuman training`<br>`Mechanically Enhanced Body Weaponry`<br>`Willpower manifestation`<br>`Swords; Haki; Fire` |
| jname       | unmapped | template (100% filled, 6 distinct)             | `{{Ruby\|六式\|ろくしき}}`<br>`ウソップ戦法`<br>`三刀流`<br>`天候術`<br>`戦法`                                                                                                         |
| meaning     | unmapped | text (100% filled, 6 distinct)                 | `Ambition; Aspiration; Drive; Vigor; Domineering Spirit; Will (to Conquer/Rule)`<br>`Three Sword/Blade Style`<br>`Modified Human Tactics`<br>`Art of Weather`<br>`Usopp Tactics`       |
| user        | unmapped | template (100% filled, 6 distinct)             | `Roronoa Zoro, Jigoro (former), Humandrills (anime), Isshin Dojo students (in-training)`<br>`Various living beings`<br>`CP9; Various`<br>`Franky`<br>`Usopp`                           |
| rname       | unmapped | text (83% filled, 5 distinct)                  | `Saibōgu Senpō`<br>`Usoppu Senpō`<br>`Tenkō-jutsu`<br>`Rokushiki`<br>`Santōryū`                                                                                                        |
| image       | unmapped | text (50% filled, 3 distinct)                  | `Clima-tact new and improved.png`<br>`Stussy Dodges Lucci.png`<br>`BF-36 Infobox.png`                                                                                                  |

### Spin-Off Volume Box

| Field    | Handling | Shape                               | Examples                                                                                                                                      |
| -------- | -------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| author   | unmapped | enum_like (100% filled, 2 distinct) | `Eiichiro Oda`<br>`Ei Andō`                                                                                                                   |
| djdate   | unmapped | date (100% filled, 6 distinct)      | `September 4, 2017`<br>`November 4, 2015`<br>`August 4, 2016`<br>`June 22, 2012`<br>`March 4, 2019`                                           |
| jdate    | unmapped | date (100% filled, 6 distinct)      | `November 4, 1998`<br>`October 3, 2015`<br>`August 4, 2017`<br>`March 4, 2019`<br>`July 4, 2016`                                              |
| jisbn    | unmapped | text (100% filled, 6 distinct)      | `978-4-08-880552-8`<br>`978-4-08-880732-4`<br>`978-4-08-881199-4`<br>`978-4-08-881507-7`<br>`978-4-08-881776-7`                               |
| jname    | unmapped | text (100% filled, 6 distinct)      | `ワンピース パーティー 1`<br>`ワンピース パーティー 2`<br>`ワンピース パーティー 3`<br>`ワンピース パーティー 4`<br>`ワンピース パーティー 5` |
| jpage    | unmapped | number (100% filled, 3 distinct)    | `184`<br>`192`<br>`208`                                                                                                                       |
| title    | unmapped | text (100% filled, 6 distinct)      | `One Piece Party 1`<br>`One Piece Party 2`<br>`One Piece Party 3`<br>`One Piece Party 4`<br>`One Piece Party 5`                               |
| chapters | unmapped | text (83% filled, 5 distinct)       | `11 - 15`<br>`16 - 20`<br>`21 - 25`<br>`6 - 10`<br>`1 - 5`                                                                                    |
| rname    | unmapped | date (83% filled, 5 distinct)       | `Wanpīsu Pātī 1`<br>`Wanpīsu Pātī 2`<br>`Wanpīsu Pātī 3`<br>`Wanpīsu Pātī 4`<br>`Wanpīsu Pātī 5`                                              |
| dedate   | unmapped | date (17% filled, 1 distinct)       | `November 12, 2024`                                                                                                                           |
| deisbn   | unmapped | text (17% filled, 1 distinct)       | `978-1-9747-5091-7`                                                                                                                           |
| depage   | unmapped | number (17% filled, 1 distinct)     | `192`                                                                                                                                         |
| edate    | unmapped | date (17% filled, 1 distinct)       | `November 12, 2024`                                                                                                                           |
| eisbn    | unmapped | text (17% filled, 1 distinct)       | `978-1-97-474992-8`                                                                                                                           |
| ename    | unmapped | text (17% filled, 1 distinct)       | `Wanted! Eiichiro Oda Before One Piece`                                                                                                       |
| epage    | unmapped | number (17% filled, 1 distinct)     | `208`                                                                                                                                         |
| image    | unmapped | text (17% filled, 1 distinct)       | `Wanted Infobox.png`                                                                                                                          |

### Race Box → `race`

| Field       | Handling | Shape                                          | Examples                                                                                                                                                                                                                                  |
| ----------- | -------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| colorscheme | unmapped | text (100% filled, 6 distinct)                 | `ShandiansColors`<br>`Fish-MenColors`<br>`MerfolkColors`<br>`GiantsColors`<br>`OkamaColors`                                                                                                                                               |
| ename       | unmapped | text (100% filled, 6 distinct, multi)          | `Fish-Men (Viz, Funimation); Mermen (4Kids, Manga Entertainment); Fishmen (Live-Action)`<br>`Shandians (VIZ); Loftrians (Edited dub); Shandorians (Uncut dub)`<br>`Merfolk (Mermaid; Merman)`<br>`Queers (FUNimation)`<br>`Klabautermann` |
| features    | unmapped | template (100% filled, 6 distinct)             | `Largest known race (over 12m in height)`<br>`* Crossdressing * Sex change`<br>`Spiritual manifestation`<br>`Fish-like features`<br>`Fish-like tail`                                                                                      |
| first       | unmapped | wikilink_list (100% filled, 6 distinct, multi) | `Chapter 195 (cover page); Episode 306`<br>`Chapter 221; Episode 145`<br>`Chapter 254; Episode 167`<br>`Chapter 129; Episode 78`<br>`Chapter 69; Episode 31`                                                                              |
| jname       | unmapped | text (100% filled, 6 distinct)                 | `クラバウターマン`<br>`シャンディア`<br>`オカマ`<br>`巨人族`<br>`人魚`                                                                                                                                                                    |
| homeland    | unmapped | template (83% filled, 4 distinct)              | `Various islands (including Elbaph)`<br>`Momoiro Island, other locations`<br>`Fish-Man Island`<br>`Jaya`                                                                                                                                  |
| rname       | unmapped | text (67% filled, 4 distinct)                  | `Kurabautāman`<br>`Kyojin-zoku`<br>`Gyojin`<br>`Ningyo`                                                                                                                                                                                   |
| price       | unmapped | template (50% filled, 3 distinct, multi)       | `Young female: 70,000,000 Parted females: 10,000,000 Males: 1,000,000`<br>`Males: 50,000,000 Females: 10,000,000`<br>`1,000,000`                                                                                                          |
| Funi eval   | unmapped | template (17% filled, 1 distinct)              | `{{W\|Brittney Karbowski}}`                                                                                                                                                                                                               |
| image       | unmapped | text (17% filled, 1 distinct)                  | `Mermaid Cove Infobox.png`                                                                                                                                                                                                                |

### Merch Box

| Field   | Handling | Shape                                   | Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| date    | unmapped | text (100% filled, 6 distinct)          | `September 2004 Early February 2008 (Rerelease)`<br>`Third week of April, 2010`<br>`February 11, 2012`<br>`November 27, 2010`<br>`August 10, 2024`                                                                                                                                                                                                                                                                                                           |
| image   | unmapped | text (100% filled, 4 distinct)          | `<Tabber> Artwork = File:KumitateShikiMugiwaraTheaterJusticeTime1.png`<br>`<gallery> GrandShipCollection-ThousandSunny-box.png`<br>`<gallery> One Piece Figure & Bank Original.png`<br>`250px`                                                                                                                                                                                                                                                               |
| name    | unmapped | wikilink_list (100% filled, 6 distinct) | `Don Luffione, Don Zorocia, and Robita`<br>`Monkey D. Luffy and Tony Tony Chopper`<br>`Monkey D. Luffy (Romance Dawn)`<br>`Monkey D. Luffy`<br>`Thousand Sunny`                                                                                                                                                                                                                                                                                              |
| parts   | unmapped | prose (100% filled, 6 distinct, multi)  | `* Main body x1 * Alternate hair set x1 * Face plate x4 * Arm pair x1 * Hand set x3 * Luffy doll x1 * Mantle x1 * Altern…`<br>`*-Main body *-3 pairs of interchangeable hands (L/R) *-3 interchangeable face parts *-Interchangeable hair set *-Meat w…`<br>`*Runner x4, marking sticker x1, color sticker x1, manual x1 *Sea surface effect part x1, stand base x1`<br>`* Main body (per figure) * Pedestal (per figure)`<br>`* Main body * Removable lock` |
| type    | unmapped | enum_like (100% filled, 2 distinct)     | `Model kit`<br>`Figurine`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| item    | unmapped | template (83% filled, 5 distinct)       | `{{Nihongo\|One Piece Ready-Made Mugiwara Theater Figure ～Jingi-nai Time～ vol. 1\|ワンピース 組立式ワンピース麦わら劇場フィギュア～仁義ないＴＩＭＥ～ｖｏｌ．１\|…`<br>`{{Nihongo\|Monkey D. Luffy (Romance Dawn)\|モンキー・D・ルフィ -冒険の夜明け-\|Monkī D rufi - bōken no yoake -}}`<br>`TV Anime One Piece Figure & Bank`<br>`Monkey D. Luffy`<br>`Boa Hancock`                                                                                      |
| height  | unmapped | text (67% filled, 4 distinct)           | `14.5 cm`<br>`10 cm`<br>`13 cm`<br>`16 cm`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| price   | unmapped | text (67% filled, 4 distinct)           | `¥1,680 (VAT included)`<br>`¥3,080 VAT included`<br>`¥1,980 with VAT`<br>`¥4,400 with VAT`                                                                                                                                                                                                                                                                                                                                                                   |
| Figures | unmapped | text (17% filled, 1 distinct)           | `File:KumitateShikiMugiwaraTheaterJusticeTime1b.png </Tabber>`                                                                                                                                                                                                                                                                                                                                                                                               |
| link    | unmapped | text (17% filled, 1 distinct)           | `[https://tamashiiweb.com/item/14796/ Tamashii Nations]`                                                                                                                                                                                                                                                                                                                                                                                                     |
| notes   | unmapped | date (17% filled, 1 distinct)           | `Grand Ship Collection #1`                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Album Box → `album`

| Field    | Handling | Shape                              | Examples                                                                                              |
| -------- | -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| image    | unmapped | wikilink (100% filled, 2 distinct) | `220px`<br>`230px`                                                                                    |
| length   | unmapped | text (100% filled, 6 distinct)     | `16 mins.`<br>`43 mins.`<br>`45 mins.`<br>`48 mins.`<br>`65 mins.`                                    |
| released | unmapped | text (100% filled, 6 distinct)     | `9th December 2009`<br>`10th March 2004`<br>`13th March 2002`<br>`2nd March 2005`<br>`5th March 2003` |
| title    | unmapped | text (100% filled, 6 distinct)     | `Jungle Fever`<br>`Movie 10 OST`<br>`Movie 3 OST`<br>`Movie 4 OST`<br>`Movie 5 OST`                   |
| artist   | unmapped | text (50% filled, 2 distinct)      | `Kohei Tanaka and Shiro Hamaguchi`<br>`One Piece`                                                     |
| produced | unmapped | text (50% filled, 1 distinct)      | `Avex Entertainment`                                                                                  |
| label    | unmapped | text (33% filled, 1 distinct)      | `Avex Entertainment`                                                                                  |

### Movie Box

| Field      | Handling | Shape                                 | Examples                                                                                                                                                                                                                                                                                                                                                |
| ---------- | -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| biliDate   | unmapped | date (100% filled, 2 distinct)        | `September 1, 2021`<br>`November 3, 2024`                                                                                                                                                                                                                                                                                                               |
| biliName   | unmapped | text (100% filled, 6 distinct)        | `The Giant Mechanical Soldier of Karakuri Castle`<br>`Chopper Kingdom of Strange Animal Island`<br>`Clockwork Island Adventure`<br>`Jango's Dance Carnival`<br>`One Piece: The Movie`                                                                                                                                                                   |
| date       | unmapped | text (100% filled, 6 distinct, multi) | `March 3, 2001 October 21, 2001 (VHS/DVD) November 21, 2009 (Blu-Ray)`<br>`March 4, 2000 January 21, 2001 (VHS/DVD) November 21, 2009 (Blu-Ray)`<br>`March 2, 2002 October 21, 2002 (DVD) November 21, 2009 (Blu-Ray)`<br>`March 1, 2003 DVD: July 21, 2003 Blu-ray: December 11, 2009`<br>`March 4, 2006 DVD: July 21, 2006 Blu-ray: January 21, 2010` |
| director   | unmapped | text (100% filled, 5 distinct)        | `Atsuji Shimizu`<br>`Daisuke Nishio`<br>`Junji Shimizu`<br>`Konosuke Uda`<br>`Kōnosuke Uda`                                                                                                                                                                                                                                                             |
| jname      | unmapped | text (100% filled, 6 distinct)        | `ONE PIECE THE MOVIE カラクリ城のメカ巨兵`<br>`ONE PIECE THE MOVIE デッドエンドの冒険`<br>`ONE PIECE 珍獣島のチョッパー王国`<br>`ONE PIECE ねじまき島の冒険`<br>`ジャンゴのダンスカーニバル`                                                                                                                                                            |
| next       | unmapped | text (100% filled, 6 distinct)        | `Episode of Arabasta: The Desert Princess and the Pirates`<br>`Chopper's Kingdom on the Island of Strange Animals`<br>`Clockwork Island Adventure`<br>`The Cursed Holy Sword`<br>`Dead End Adventure`                                                                                                                                                   |
| rname      | unmapped | text (100% filled, 6 distinct)        | `Wan Pīsu za Mūbī Karakuri-jō no Meka Kyohei`<br>`Wan Pīsu Chinjū-jima no Choppā Ōkoku`<br>`Wan Pīsu za Mūbī Deddo Endo no Bōken`<br>`Wan Pīsu Nejimaki-jima no Bōken`<br>`Jango no Dansu Kānibaru`                                                                                                                                                     |
| time       | unmapped | text (100% filled, 6 distinct)        | `5 minutes and 30 seconds`<br>`50 minutes`<br>`55 minutes`<br>`56 minutes`<br>`94 minutes`                                                                                                                                                                                                                                                              |
| toei ename | unmapped | template (100% filled, 6 distinct)    | `Chopper's Kingdom in the Strange Animal Island`<br>`Mega Mecha Soldier of Karakuri Castle`<br>`The Adventure of Spiral Island`<br>`The Adventure of Deadend`<br>`Jango's Dance Carnival`                                                                                                                                                               |
| writer     | unmapped | template (100% filled, 4 distinct)    | `{{W\|Michiru Shimada}}`<br>`Atsutoshi Umezawa`<br>`Hiroshi Hashimoto`<br>`Yoshiyuki Suga`                                                                                                                                                                                                                                                              |
| ending     | unmapped | wikilink (83% filled, 5 distinct)     | `Mabushikute`<br>`Sailing Day`<br>`Memories`<br>`Sayaendo`<br>`Believe`                                                                                                                                                                                                                                                                                 |
| image      | unmapped | text (83% filled, 5 distinct)         | `<gallery> Movie 4 Poster.png`<br>`One Piece The Movie.png`<br>`Movie 2 Poster.png`<br>`Movie 3 Poster.png`<br>`Movie 7 Poster.png`                                                                                                                                                                                                                     |
| meDate     | unmapped | date (83% filled, 3 distinct)         | `September 8, 2014`<br>`November 3, 2014`<br>`July 28, 2014`                                                                                                                                                                                                                                                                                            |
| meName     | unmapped | text (83% filled, 5 distinct)         | `Chopper's Kingdom in the Strange Animal Island`<br>`Mega Mecha Soldier of Karakuri Castle`<br>`Adventure of Spiral Island`<br>`The Adventure of Deadend`<br>`One Piece: The Movie`                                                                                                                                                                     |
| opening    | unmapped | enum_like (83% filled, 2 distinct)    | `We Are!`<br>`N/A`                                                                                                                                                                                                                                                                                                                                      |
| prev       | unmapped | text (67% filled, 4 distinct)         | `Chopper's Kingdom on the Island of Strange Animals`<br>`Baron Omatsuri and the Secret Island`<br>`Clockwork Island Adventure`<br>`One Piece: The Movie`                                                                                                                                                                                                |
| vizName    | unmapped | template (50% filled, 3 distinct)     | `Chopper's Kingdom on the Island of Strange Animals`<br>`Adventure on Clockwork Island`<br>`One Piece`                                                                                                                                                                                                                                                  |

### Event Box → `event`

| Field        | Handling | Shape                                         | Examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | -------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| colorscheme  | unmapped | enum_like (100% filled, 3 distinct)           | `BaroqueWorksColors`<br>`DrumIslandColors`<br>`HistoryColors`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ename        | unmapped | template (100% filled, 6 distinct, multi)     | `Duel at Banaro Island (VIZ); Duel at Banero Island (Funimation dub); Decisive Battle of Banaro Island (Funimation sub)`<br>`Paramount War (VIZ Media); War of the Best (Funimation)`<br>`Great Doctor Hunt (VIZ) Doctor Hunt (Funimation, Odex)`<br>`Ohara Incident Ohara Tragedy`<br>`Battle of Edd War`                                                                                                                                                                                                            |
| jname        | unmapped | text (100% filled, 6 distinct)                | `マリンフォード頂上戦争`<br>`エッド・ウォーの海戦`<br>`作戦名『ユートピア』`<br>`バナロ島の決闘`<br>`オハラの事件`                                                                                                                                                                                                                                                                                                                                                                                                    |
| location     | unmapped | wikilink (100% filled, 6 distinct)            | `Arabasta Kingdom`<br>`Banaro Island`<br>`Drum Island`<br>`Marineford`<br>`Edd War`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| outcome      | unmapped | prose (100% filled, 6 distinct, multi)        | `*Marines' pyrrhic victory; *Portgas D. Ace and Whitebeard die in combat; *Gol D. Roger's bloodline ends; *Whitebeard co…`<br>`*The death of all archaeologists and citizens except Nico Robin *Ohara is left in ruin *Destruction of six Marine battl…`<br>`*Teach defeats Ace and hands him to the Marines *Teach became one of the Seven Warlords of the Sea *Ace was imprisoned …`<br>`*Half the Golden Lion Pirates' fleet sunk *Shiki stuck with a steering wheel in his head permanently`<br>`Partial Success` |
| rname        | unmapped | text (100% filled, 6 distinct)                | `Marinfōdo Chōjō Sensō`<br>`Sakusen Mei "Yūtopia"`<br>`Banaro-tō no Kettō`<br>`Eddo Wō no Kaisen`<br>`Ohara no Jiken`                                                                                                                                                                                                                                                                                                                                                                                                 |
| date         | unmapped | number (83% filled, 4 distinct)               | `10`<br>`22`<br>`27`<br>`2`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| first        | unmapped | wikilink_list (83% filled, 5 distinct, multi) | `Chapter 393; Episode 276`<br>`Chapter 440; Episode 325`<br>`Chapter 552; Episode 461`<br>`Chapter 141; Episode 85`<br>`Chapter 0; Episode 0`                                                                                                                                                                                                                                                                                                                                                                         |
| duration     | unmapped | wikilink_list (67% filled, 4 distinct, multi) | `(7:00AM-After 4:30PM) Chapters 170-211 Episodes 106-127`<br>`Chapters 393-397; Episodes 276-278`<br>`Chapters 552-580; Episodes 461-489`<br>`Chapters 440-441; Episode 325`                                                                                                                                                                                                                                                                                                                                          |
| factions     | unmapped | wikilink_list (67% filled, 4 distinct, multi) | `Marines Seven Warlords of the Sea Whitebeard Pirates`<br>`Baroque Works Rebel Army Arabasta military`<br>`Golden Lion Pirates Roger Pirates`<br>`Ohara archaeologists CP9 Marines`                                                                                                                                                                                                                                                                                                                                   |
| instigator   | unmapped | wikilink (67% filled, 4 distinct)             | `World Government`<br>`Crocodile`<br>`Marines`<br>`Wapol`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| commanders   | unmapped | wikilink_list (50% filled, 3 distinct, multi) | `Clou D. Clover Spandine Sengoku`<br>`Sengoku Whitebeard`<br>`Shiki Gol D. Roger`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| type         | unmapped | text (50% filled, 3 distinct)                 | `Large-scale skirmish War Execution`<br>`Genocide`<br>`Battle`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| image        | unmapped | text (33% filled, 2 distinct)                 | `Baroque Works Cannon.png`<br>`Edd War Infobox.png`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| other        | unmapped | wikilink_list (33% filled, 2 distinct, multi) | `241 Impel Down escapees Blackbeard Pirates`<br>`Jaguar D. Saul`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| extra1       | unmapped | wikilink (17% filled, 1 distinct)             | `Duel on Banaro Island`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| extra1title  | unmapped | text (17% filled, 1 distinct)                 | `Precursor`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| instigators  | unmapped | wikilink_list (17% filled, 1 distinct, multi) | `Marshall D. Teach Portgas D. Ace`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| participants | unmapped | wikilink (17% filled, 1 distinct)             | `Blackbeard Pirates`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| time         | unmapped | number (17% filled, 1 distinct)               | `2`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Occupation Box

| Field       | Handling | Shape                                          | Examples                                                                                                                                  |
| ----------- | -------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| first       | unmapped | wikilink_list (100% filled, 5 distinct, multi) | `Chapter 303; Episode 225`<br>`Chapter 114; Episode 67`<br>`Chapter 37; Episode 10`<br>`Chapter 43; Episode 20`<br>`Chapter 1; Episode 1` |
| jname       | unmapped | text (100% filled, 6 distinct)                 | `麦わら帽子 or 麦わら`<br>`海賊船長`<br>`考古学者`<br>`コック`<br>`船大工`                                                                |
| rname       | unmapped | text (100% filled, 6 distinct)                 | `Mugiwara-Bōshi or Mugiwara`<br>`Kaizoku Senchō`<br>`Kōkogakusha`<br>`Funadaiku`<br>`Taishō`                                              |
| colorscheme | unmapped | text (83% filled, 5 distinct)                  | `PirateCrewDefaultColors`<br>`ShipwrightColors`<br>`HistoryColors`<br>`MarinesColors`<br>`CooksColors`                                    |
| ename       | unmapped | text (50% filled, 3 distinct)                  | `Archaeologist`<br>`Straw Hat`<br>`Admiral`                                                                                               |
| image       | unmapped | text (33% filled, 2 distinct)                  | `Admiral Infobox.png`<br>`Straw Hat.png`                                                                                                  |
| affiliation | unmapped | template (17% filled, 1 distinct)              | `Marines`                                                                                                                                 |
| name        | unmapped | text (17% filled, 1 distinct)                  | `Admiral`                                                                                                                                 |

### International box

| Field          | Handling | Shape                               | Examples                                                                                                                                                                                                                      |
| -------------- | -------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| censorship     | unmapped | text (100% filled, 5 distinct)      | `In episode 36, Nami saying she'll pay with her body (flashback right after Bell-mére's death) In episode 52, Gold D. Ro…`<br>`Yes (Venus Centre Dub) No (MBC Action)`<br>`Yes (4kids and early Funimation)`<br>`Yes`<br>`No` |
| continent      | unmapped | enum_like (100% filled, 3 distinct) | `North America`<br>`Europe`<br>`Asia`                                                                                                                                                                                         |
| language       | unmapped | text (100% filled, 6 distinct)      | `Filipino (Anime) English (Manga)`<br>`Portuguese`<br>`Catalan`<br>`English`<br>`Arabic`                                                                                                                                      |
| numberepisodes | unmapped | text (100% filled, 6 distinct)      | `104 (Venus Centre Dub and Space Power) 1104 (MBC Action)`<br>`628 (Catalonia); 195 (Valencian Country)`<br>`104 (4Kids) 1108 (Funimation)`<br>`106`<br>`195`                                                                 |
| numbervolumes  | unmapped | text (100% filled, 6 distinct)      | `107 (All VIZ Media releases)`<br>`None`<br>`104`<br>`107`<br>`39`                                                                                                                                                            |
| transmitted1   | unmapped | text (100% filled, 6 distinct)      | `March 2nd, 2006 (Catalonia); 2007 (Valencian Country)`<br>`August 23, 2002 (Television, dubbed)`<br>`2004 (4Kids) 2007 (Funimation)`<br>`April 14th, 2002`<br>`January 3, 2005`                                              |
| image          | unmapped | text (83% filled, 5 distinct)       | `One Piece in the Catalan Countries Infobox.png`<br>`MBC Action One Piece announcement.png`<br>`One Piece Philippines Logo.png`<br>`One Piece Greece Logo.png`<br>`File:OP FUNi logo.png`                                     |
| name           | unmapped | text (83% filled, 5 distinct)       | `One Piece in the Catalan Countries`<br>`One Piece in the Philippines`<br>`One Piece in North America`<br>`One Piece in Arabic`<br>`One Piece in Greece`                                                                      |
| imagetext      | unmapped | text (0% filled, 0 distinct)        |                                                                                                                                                                                                                               |
| published1     | unmapped | date (17% filled, 1 distinct)       | `April 26, 2023`                                                                                                                                                                                                              |

### Live-Action Episode Box → `live-action-episode`

| Field        | Handling | Shape                                          | Examples                                                                                                                                                                                              |
| ------------ | -------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Airdate      | unmapped | date (100% filled, 1 distinct)                 | `August 31, 2023`                                                                                                                                                                                     |
| Credit_Music | unmapped | wikilink_list (100% filled, 6 distinct, multi) | `Kuro & The Black Cat Pirates / The Pirates Are Coming`<br>`Luffy Help Me / I Ain't Surrendering`<br>`Captain of the Dreaded Cook Pirates`<br>`The Grand Line / Chop Chop Cannon`<br>`Captain Alvida` |
| Director     | unmapped | template (100% filled, 4 distinct)             | `Emma Sullivan`<br>`Josef Wladyka`<br>`Tim Southam`<br>`Marc Jobst`                                                                                                                                   |
| Episode      | unmapped | number (100% filled, 6 distinct)               | `1`<br>`2`<br>`3`<br>`5`<br>`6`                                                                                                                                                                       |
| Next         | unmapped | text (100% filled, 6 distinct)                 | `The Girl with the Sawfish Tattoo`<br>`The Chef and the Chore Boy`<br>`The Man in the Straw Hat`<br>`The Pirates are Coming`<br>`Worst in the East`                                                   |
| Runtime      | unmapped | text (100% filled, 6 distinct)                 | `1:01:28`<br>`49:32`<br>`52:18`<br>`55:27`<br>`58:02`                                                                                                                                                 |
| Screenplay   | unmapped | template (100% filled, 6 distinct, multi)      | `Tiffany Greshler & Ian Stokes Allisan Weintraub & Lindsay Gelfand`<br>`Steven Maeda Diego Gutierrez`<br>`Matt Owens & Damani Johnson`<br>`Matt Owens Steven Maeda`<br>`Laura Jacqmin`                |
| Season       | unmapped | number (100% filled, 1 distinct)               | `1`                                                                                                                                                                                                   |
| Pre          | unmapped | text (83% filled, 5 distinct)                  | `Romance Dawn (Live-Action)`<br>`The Chef and the Chore Boy`<br>`The Man in the Straw Hat`<br>`The Pirates are Coming`<br>`Eat at Baratie!`                                                           |
| Title_Music  | unmapped | template (83% filled, 3 distinct)              | `Wealth Fame Power`<br>`Let's Disappear`<br>`The Grand Line`                                                                                                                                          |
| Title        | unmapped | text (17% filled, 1 distinct)                  | `Romance Dawn`                                                                                                                                                                                        |

### Scroll box

| Field   | Handling | Shape                                         | Examples                                                                                                                   |
| ------- | -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| content | unmapped | wikilink_list (17% filled, 1 distinct, multi) | `*Monkey D. Luffy (161 Variants) *Roronoa Zoro (99 Variants) *Nami (109 Variants) **One Piece Magazine Special: Three Sw…` |

### Manga Box

| Field       | Handling | Shape                              | Examples                                                                                                                                                                                                                |
| ----------- | -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| author      | unmapped | template (100% filled, 6 distinct) | `Yūto Tsukuda Shun Saeki`<br>`Yoshikazu Amami`<br>`Ryo Ishiyama`<br>`Sohei Kouji`<br>`Nakamaru`                                                                                                                         |
| chapters    | unmapped | template (100% filled, 6 distinct) | `- 3}} (+3 Bonus)<!-- 3 bonus chapters -> minus 3 -->`<br>`47 (+5 Bonus)`<br>`4 (+2 Extra)`<br>`6 (+1 Bonus)`<br>`12`                                                                                                   |
| genre       | unmapped | text (100% filled, 4 distinct)     | `Comedy, Action, Adventure, Fantasy`<br>`Cooking, comedy, slice-of-life`<br>`Action, adventure`<br>`Comedy`                                                                                                             |
| image       | unmapped | text (100% filled, 6 distinct)     | `One Piece episode A Volume 1.png`<br>`One Piece Kobiyama Volume 1.png`<br>`Shokugeki no Sanji Infobox.PNG`<br>`One Piece School Volume 1.png`<br>`One Piece Party Volume 1.png`                                        |
| jname       | unmapped | template (100% filled, 6 distinct) | `{{Ruby\|ONE PIECE episode A\|ワンピース エピソード エース}}`<br>`ONE PIECE コビー似の小日山～ウリふたつなぎの大秘宝～`<br>`ONE PIECE学園`<br>`ワンピースパーティー`<br>`食戟のサンジ`                                  |
| magazine    | unmapped | template (100% filled, 4 distinct) | `{{W\|Shōnen Jump+}}`<br>`One Piece Magazine`<br>`Weekly Shonen Jump`<br>`Saikyo Jump`                                                                                                                                  |
| publisher   | unmapped | template (100% filled, 1 distinct) | `{{W\|Shueisha}}`                                                                                                                                                                                                       |
| rname       | unmapped | text (100% filled, 6 distinct)     | `Wan Pīsu Kobī ni no Kobiyama～Urifutatsu Nagi no Ōhihō～`<br>`Wan Pīsu episōdo Ēsu`<br>`Shokugeki no Sanji`<br>`Wan Pīsu Gakuen`<br>`Wan Pīsu Pātī`                                                                    |
| run         | unmapped | template (100% filled, 6 distinct) | `December 5, 2014 – October 4, 2019 July 22, 2020 - February 2, 2021`<br>`September 16, 2020 – December 2, 2021`<br>`July 23, 2018 – July 25, 2022`<br>`June 1, 2018 – April 2, 2020`<br>`June 18, 2018 – July 1, 2019` |
| volumes     | unmapped | template (100% filled, 5 distinct) | `{{PAGESINCATEGORY:One Piece School Volumes}}`<br>`1`<br>`2`<br>`3`<br>`7`                                                                                                                                              |
| title       | unmapped | text (83% filled, 5 distinct)      | `Kobiyama Who Looks Like Koby - Two Piece in a Pod`<br>`One Piece episode A`<br>`Shokugeki no Sanji`<br>`One Piece School`<br>`Chin Piece`                                                                              |
| ename       | unmapped | text (67% filled, 4 distinct)      | `ONE PIECE: Kobiyama, Coby's Look-Alike — The Great Treasure of Identical Doubles`<br>`One Piece: Ace's Story—The Manga`<br>`Food Wars! Shokugeki no Sanji`<br>`One Piece Academy (MM)`                                 |
| colorscheme | unmapped | text (17% filled, 1 distinct)      | `ShokugekinoSanjiColors`                                                                                                                                                                                                |
| name        | unmapped | text (17% filled, 1 distinct)      | `One Piece Party`                                                                                                                                                                                                       |

### Saga Box → `saga`

| Field   | Handling | Shape                                 | Examples                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | -------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chapter | unmapped | enum_like (100% filled, 1 distinct)   | `auto`                                                                                                                                                                                                                                                                                                                                                                                                                |
| date    | unmapped | text (100% filled, 6 distinct, multi) | `2012-2015 (Manga) 2012-2016 (Japanese Anime Broadcast) 2022- (Funimation Dub Broadcast on Adult Swim's Toonami)`<br>`2010-2012 (Manga) 2011-2012 (Japanese Anime Broadcast) 2022 (Funimation Dub Broadcast on Adult Swim's Toonami)`<br>`1997-1999 (Manga) 1999-2001 (Anime) 2023 and 2026 (Live-Action)`<br>`1999-2002 (Manga) 2001-2002 (Anime) 2026-2027 (Live Action)`<br>`2008-2010 (Manga), 2009-2011 (Anime)` |
| episode | unmapped | enum_like (100% filled, 2 distinct)   | `1-61, 61 episodes; (4Kids: 1-43, 43 episodes)`<br>`auto`                                                                                                                                                                                                                                                                                                                                                             |
| next    | unmapped | wikilink (100% filled, 6 distinct)    | `Whole Cake Island Saga`<br>`Fish-Man Island Saga`<br>`Sky Island Saga`<br>`Dressrosa Saga`<br>`Arabasta Saga`                                                                                                                                                                                                                                                                                                        |
| vol     | unmapped | enum_like (100% filled, 1 distinct)   | `auto`                                                                                                                                                                                                                                                                                                                                                                                                                |
| prev    | unmapped | wikilink (83% filled, 5 distinct)     | `Fish-Man Island Saga`<br>`Thriller Bark Saga`<br>`Summit War Saga`<br>`East Blue Saga`<br>`Arabasta Saga`                                                                                                                                                                                                                                                                                                            |
| liveact | unmapped | text (33% filled, 2 distinct)         | `1-9, 9 episodes`<br>`10-`                                                                                                                                                                                                                                                                                                                                                                                            |

### OVA Box

| Field      | Handling | Shape                                    | Examples                                                                                                                                                          |
| ---------- | -------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #          | unmapped | text (100% filled, 3 distinct)           | `1st`<br>`2nd`<br>`3rd`                                                                                                                                           |
| Ed         | unmapped | template (100% filled, 3 distinct)       | `{{W\|Goro Taniguchi}}`<br>`{{伊藤尚往}}`<br>`{{所勝美}}`                                                                                                         |
| image      | unmapped | text (100% filled, 3 distinct)           | `Defeat Him! The Pirate Ganzack.png`<br>`170px\|The DVD cover`<br>`250px`                                                                                         |
| Kanji      | unmapped | text (100% filled, 3 distinct)           | `ONE PIECE FILM STRONG WORLD: EPISODE 0`<br>`ONE PIECE ロマンス ドーン ストーリー`<br>`ワンピース 倒せ! 海賊ギャンザック`                                         |
| Music      | unmapped | text (100% filled, 3 distinct, multi)    | `田中公平 - Taira Hiroshi Tanaka 浜口史郎 - Hamaguti Shirou`<br>`田中公平 - Kohei Tanaka 浜口史郎 - Hamaguti Shirō`<br>`Toshiya Motomichi`                        |
| Production | unmapped | text (100% filled, 3 distinct)           | `Tetsuo Otoku Hidekazu Terakawa`<br>`松坂一光 - Matsuzaka Kazumitsu`<br>`黒木耕次郎 - Jiro K. Kurogi`                                                             |
| Release    | unmapped | template (100% filled, 3 distinct)       | `September 21, 2008 (theatrical) November 24, 2008 (Official Site) Late April, 2009 (limited DVD) January 6, 2011 (au Sm…`<br>`April 16, 2010`<br>`July 26, 1998` |
| Romaji     | unmapped | text (100% filled, 3 distinct)           | `Wan Pīsu Firumu Sutorongu Wārudo Episōdo Zero`<br>`Wan Pīsu: Taose! Kaizoku Gyanzakku`<br>`ONE PIECE Romansu Dōn Stori`                                          |
| Screen     | unmapped | template (100% filled, 3 distinct)       | `Hiroaki Kitajima`<br>`{{櫻井剛}}`<br>`{{田中仁}}`                                                                                                                |
| Ad         | unmapped | template (67% filled, 2 distinct, multi) | `橋本敬史 - Hashimoto Takashi (Special Effects)`<br>`{{島貫正弘}}`                                                                                                |
| chapter    | unmapped | date (67% filled, 2 distinct)            | `Romance Dawn, Version 1`<br>`Chapter 0`                                                                                                                          |
| Ending     | unmapped | wikilink (67% filled, 2 distinct)        | `A Thousand Dreamers`<br>`Grand Line`                                                                                                                             |
| English    | unmapped | template (67% filled, 2 distinct, multi) | `Defeat! Gyanzack the Pirate; Defeat Them! The Ganzak Pirates`<br>`EPISODE:0 -ONE PIECE FILM STRONG WORLD-`                                                       |
| Plan       | unmapped | text (67% filled, 2 distinct)            | `柴田宏明 - Shibata Hiroaki`<br>`浅間陽介 - Asama Yousuke`                                                                                                        |
| Art        | unmapped | template (33% filled, 1 distinct)        | `{{吉池隆司}}`                                                                                                                                                    |
| Edit       | unmapped | text (33% filled, 1 distinct)            | `牧信公 - Official Maki Makoto`                                                                                                                                   |
| imagetext  | unmapped | text (33% filled, 1 distinct)            | `Defeat Him! The Pirate Ganzack Poster`                                                                                                                           |
| Opening    | unmapped | text (33% filled, 1 distinct)            | `N/A`                                                                                                                                                             |
| Record     | unmapped | text (33% filled, 1 distinct, multi)     | `渡辺絵里奈 - Erina Watanabe 新井秀徳 - Arai Hidenori`                                                                                                            |

### Animanga Box

| Field       | Handling | Shape                                    | Examples                                                       |
| ----------- | -------- | ---------------------------------------- | -------------------------------------------------------------- |
| animerun    | unmapped | text (100% filled, 2 distinct)           | `January 5, 2026 - March 23, 2026`<br>`April 1–5, 2025`        |
| chapters    | unmapped | template (100% filled, 2 distinct)       | `6+ ----sub,,-3}² }}+ strips (+1 Extra)`<br>`180 (+18 Extras)` |
| episodes    | unmapped | date (100% filled, 2 distinct)           | `12 (+1 Extra)`<br>`5 (+1 Extra)`                              |
| genre       | unmapped | text (100% filled, 2 distinct)           | `Romance, Comedy`<br>`Slice of Life`                           |
| image       | unmapped | text (100% filled, 2 distinct)           | `One Piece in Love Volume 1.png`<br>`Chopper's.png`            |
| jname       | unmapped | text (100% filled, 2 distinct)           | `CHOPPER’s`<br>`恋するワンピース`                              |
| network     | unmapped | template (100% filled, 2 distinct)       | `{{W\|Fuji TV\|Fuji Television}}`<br>`, ,`                     |
| publisher   | unmapped | template (100% filled, 1 distinct)       | `{{W\|Shueisha}}`                                              |
| run         | unmapped | text (100% filled, 2 distinct)           | `June 18, 2018 – January 22, 2026`<br>`May 17, 2025 – Ongoing` |
| studio      | unmapped | text (100% filled, 2 distinct)           | `[https://maxilla.jp maxilla]`<br>`Toei Animation`             |
| title       | unmapped | text (100% filled, 2 distinct)           | `One Piece in Love`<br>`Chopper's`                             |
| volumes     | unmapped | text (100% filled, 2 distinct)           | `1+`<br>`13`                                                   |
| author      | unmapped | wikilink (50% filled, 1 distinct)        | `Daiki Ihara`                                                  |
| colorscheme | unmapped | text (50% filled, 1 distinct)            | `RealWorldColors`                                              |
| director    | unmapped | text (50% filled, 1 distinct, multi)     | `Haruka Kamatani Hazuki Omoya`                                 |
| ename       | unmapped | template (50% filled, 1 distinct, multi) | `Koisuru One Piece One Piece in Love volume introductions}}`   |
| magazine    | unmapped | template (50% filled, 1 distinct)        | `{{W\|Shōnen Jump+}}`                                          |
| rname       | unmapped | text (50% filled, 1 distinct)            | `Koisuru Wan Pīsu`                                             |

### Game box

| Field     | Handling | Shape                          | Examples                                      |
| --------- | -------- | ------------------------------ | --------------------------------------------- |
| developer | unmapped | text (100% filled, 1 distinct) | `Konami`                                      |
| genre     | unmapped | text (100% filled, 1 distinct) | `Fighting`                                    |
| image     | unmapped | text (100% filled, 1 distinct) | `Jump Stadium Infobox.png`                    |
| jname     | unmapped | text (100% filled, 1 distinct) | `週刊少年ジャンプ 実況ジャンジャンスタジアム` |
| platform  | unmapped | text (100% filled, 1 distinct) | `iOS, Android`                                |
| release   | unmapped | date (100% filled, 1 distinct) | `August 2, 2018`                              |
| rname     | unmapped | text (100% filled, 1 distinct) | `Shūkan Shōnen Janpu Jikkyō Janjan Sutajiamu` |

### Ship box → `ship`

| Field       | Handling | Shape                                          | Examples                   |
| ----------- | -------- | ---------------------------------------------- | -------------------------- |
| affiliation | mapped   | wikilink (100% filled, 1 distinct)             | `Straw Hat Pirates`        |
| colorscheme | ignored  | text (100% filled, 1 distinct)                 | `StrawHatPiratesColors`    |
| ename       | mapped   | text (100% filled, 1 distinct)                 | `Barrel Tiger`             |
| first       | mapped   | wikilink_list (100% filled, 1 distinct, multi) | `Chapter 306; Episode 209` |
| jname       | mapped   | text (100% filled, 1 distinct)                 | `タルタイガー号`           |
| rname       | mapped   | text (100% filled, 1 distinct)                 | `Tarutaigā-gō`             |
| status      | ignored  | number (100% filled, 1 distinct)               | `1`                        |

## Page structure (outside the infobox)

Where the bulk of the data actually lives: recurring section headings, wikitable column signatures (rows are entities or edges, not fields) and `{{Qref}}` citation density (the per-source anchors that fill the `since` axis and the appearance edges).

### Chapter Box — 6 page(s) surveyed

0.2 Qref citation(s) and 59 wikilink(s) per page.

| Section heading            | Pages |
| -------------------------- | ----: |
| Site Navigation            |     6 |
| Characters                 |     5 |
| Premise                    |     4 |
| Summary                    |     4 |
| Trivia                     |     4 |
| Author Comment             |     2 |
| Chapter Notes              |     2 |
| Cover Page                 |     2 |
| Long Summary               |     2 |
| Quick Reference            |     2 |
| Short Summary              |     2 |
| References                 |     1 |
| Translation and Dub Issues |     1 |

| Table columns                                                      | Tables | Rows |
| ------------------------------------------------------------------ | -----: | ---: |
| Pirates · Marines · Bounty Hunters · Shipwrights · Citizens        |      1 |    1 |
| Pirates · Marines · Bounty Hunters · Revolutionary Army · Citizens |      1 |    1 |

### Episode Box — 6 page(s) surveyed

0.0 Qref citation(s) and 53 wikilink(s) per page.

| Section heading                   | Pages |
| --------------------------------- | ----: |
| Anime Notes                       |     6 |
| Characters in Order of Appearance |     6 |
| Site Navigation                   |     6 |
| Long Summary                      |     5 |
| Short Summary                     |     5 |
| First Part                        |     1 |
| Long Summary Part 1               |     1 |
| Long Summary Part 2               |     1 |
| References                        |     1 |
| Second Part                       |     1 |
| Short Summary Part 1              |     1 |
| Short Summary Part 2              |     1 |
| Summary                           |     1 |

### Scroll Box — 1 page(s) surveyed

106.0 Qref citation(s) and 329 wikilink(s) per page.

| Section heading             | Pages |
| --------------------------- | ----: |
| Abilities and Powers        |     1 |
| Anime and Manga Differences |     1 |
| Appearance                  |     1 |
| Armament Haki               |     1 |
| Awakening                   |     1 |
| Backstory                   |     1 |
| Candy Pirates               |     1 |
| Carpentry                   |     1 |
| CP9                         |     1 |
| Devil Fruit                 |     1 |
| Early Concepts              |     1 |
| Enemies                     |     1 |
| External links              |     1 |
| Franky                      |     1 |
| Gallery                     |     1 |
| Haki                        |     1 |
| Hattori                     |     1 |
| Iceburg                     |     1 |
| Jabra                       |     1 |
| Kaku                        |     1 |

### Island Box — 6 page(s) surveyed

25.3 Qref citation(s) and 96 wikilink(s) per page.

| Section heading            | Pages |
| -------------------------- | ----: |
| References                 |     6 |
| Site Navigation            |     6 |
| Trivia                     |     6 |
| History                    |     5 |
| Past                       |     4 |
| Translation and Dub Issues |     4 |
| Citizens                   |     3 |
| Whole Cake Island Saga     |     3 |
| Architecture               |     2 |
| General Information        |     2 |
| Layout and Locations       |     2 |
| Levely Arc                 |     2 |
| Sky Island Saga            |     2 |
| Wano Country Arc           |     2 |
| Wano Country Saga          |     2 |
| After the Buster Call      |     1 |
| Alubarna                   |     1 |
| Angel Beach                |     1 |
| Angel Island               |     1 |
| Arabasta Arc               |     1 |

### Simple Box — 6 page(s) surveyed

40.0 Qref citation(s) and 203 wikilink(s) per page.

| Section heading                   | Pages |
| --------------------------------- | ----: |
| References                        |     6 |
| Site Navigation                   |     6 |
| Trivia                            |     6 |
| Translation and Dub Issues        |     3 |
| External Links                    |     2 |
| History                           |     2 |
| Notes                             |     2 |
| Wano Country                      |     2 |
| 4Kids                             |     1 |
| Amounts                           |     1 |
| Ancient Weapons                   |     1 |
| Anime and Manga Differences       |     1 |
| Appearance                        |     1 |
| Appointed Time                    |     1 |
| Art Evolution                     |     1 |
| Assistant Years (1994-1997)       |     1 |
| Background                        |     1 |
| Big Mom's Question                |     1 |
| Birth of the World Government     |     1 |
| Breakthrough: Wanted! (1992-1993) |     1 |

| Table columns                                  | Tables | Rows |
| ---------------------------------------------- | -----: | ---: |
| Title · Classification · Further Notes         |      1 |   16 |
| Name · Status · Affiliation · Nickname · Notes |      1 |   15 |
| Work · Mangaka · Image · Notes                 |      1 |    7 |
| Timeslot · Period · Episodes                   |      1 |    6 |
| Bounty Threshold · Explanation                 |      1 |    6 |

### Devil Fruit Box — 6 page(s) surveyed

27.3 Qref citation(s) and 68 wikilink(s) per page.

| Section heading            | Pages |
| -------------------------- | ----: |
| Etymology                  |     6 |
| References                 |     6 |
| Trivia                     |     6 |
| Usage                      |     6 |
| Appearance                 |     5 |
| Site Navigation            |     5 |
| External Links             |     4 |
| Strengths and Weaknesses   |     4 |
| Techniques                 |     4 |
| History                    |     3 |
| Adaptation Differences     |     2 |
| Non-Canon Techniques       |     2 |
| Strengths                  |     2 |
| Translation and Dub Issues |     2 |
| Weaknesses                 |     2 |
| Anime Differences          |     1 |
| Awakening                  |     1 |
| Dressrosa Arc              |     1 |
| Early Concepts             |     1 |
| External links             |     1 |

### Song Box — 6 page(s) surveyed

3.2 Qref citation(s) and 109 wikilink(s) per page.

| Section heading                   | Pages |
| --------------------------------- | ----: |
| Lyrics                            |     6 |
| Site Navigation                   |     6 |
| Trivia                            |     5 |
| References                        |     4 |
| Characters in Order of Appearance |     3 |
| Gallery                           |     3 |
| Funimation Version                |     2 |
| FUNimation Version                |     2 |
| Intro                             |     2 |
| Opening                           |     2 |
| Original                          |     2 |
| 4kids Preview                     |     1 |
| Animation                         |     1 |
| English Versions                  |     1 |
| Episode 1000                      |     1 |
| External links                    |     1 |
| First Revision                    |     1 |
| Grand Battle Version              |     1 |
| Grand Battle!                     |     1 |
| Original Opening                  |     1 |

| Table columns                                          | Tables | Rows |
| ------------------------------------------------------ | -----: | ---: |
| (no header row)                                        |      6 |   12 |
| Japanese Kanji · Japanese Rōmaji · English Translation |      1 |   13 |

### Crew Box — 5 page(s) surveyed

48.4 Qref citation(s) and 174 wikilink(s) per page.

| Section heading     | Pages |
| ------------------- | ----: |
| History             |     5 |
| Notes               |     5 |
| References          |     5 |
| Site Navigation     |     5 |
| Trivia              |     5 |
| Crew Members        |     4 |
| Crew Strength       |     4 |
| Jaya Arc            |     4 |
| Jolly Roger         |     4 |
| Past                |     4 |
| Sky Island Saga     |     4 |
| During the Timeskip |     3 |
| East Blue Saga      |     3 |
| Egghead Arc         |     3 |
| Final Saga          |     3 |
| Impel Down Arc      |     3 |
| Loguetown Arc       |     3 |
| Marineford Arc      |     3 |
| Post-War Arc        |     3 |
| Ships               |     3 |

### Ship Box — 6 page(s) surveyed

17.3 Qref citation(s) and 91 wikilink(s) per page.

| Section heading        | Pages |
| ---------------------- | ----: |
| Site Navigation        |     6 |
| Trivia                 |     6 |
| History                |     5 |
| References             |     5 |
| Enies Lobby Arc        |     4 |
| Water 7 Arc            |     4 |
| Water 7 Saga           |     3 |
| Appearance             |     2 |
| Arabasta Arc           |     2 |
| Arabasta Saga          |     2 |
| Commissioning          |     2 |
| Design                 |     2 |
| External links         |     2 |
| Past                   |     2 |
| Abilities and Powers   |     1 |
| Adaptation Differences |     1 |
| Anime Differences      |     1 |
| Appearance and Design  |     1 |
| Arlong Park Arc        |     1 |
| Baratie Arc            |     1 |

### Message Box — 1 page(s) surveyed

0.0 Qref citation(s) and 14 wikilink(s) per page.

| Section heading     | Pages |
| ------------------- | ----: |
| Bootlegs            |     1 |
| Coming POP          |     1 |
| External Links      |     1 |
| Product Information |     1 |
| Re-released figures |     1 |
| Site Navigation     |     1 |
| Trivia              |     1 |

### Volume Box — 6 page(s) surveyed

0.0 Qref citation(s) and 49 wikilink(s) per page.

| Section heading               | Pages |
| ----------------------------- | ----: |
| Author's Notes                |     6 |
| Chapters                      |     6 |
| References                    |     6 |
| SBS Notes                     |     6 |
| Site Navigation               |     6 |
| Usopp Gallery Pirates         |     6 |
| Cover and Volume Illustration |     5 |
| Trivia                        |     2 |
| Cover                         |     1 |

| Table columns   | Tables | Rows |
| --------------- | -----: | ---: |
| (no header row) |      6 |    6 |

### Organization Box — 6 page(s) surveyed

99.7 Qref citation(s) and 275 wikilink(s) per page.

| Section heading        | Pages |
| ---------------------- | ----: |
| History                |     6 |
| References             |     6 |
| Site Navigation        |     6 |
| Enies Lobby Arc        |     5 |
| Past                   |     5 |
| Trivia                 |     5 |
| Water 7 Saga           |     5 |
| Post-Enies Lobby Arc   |     4 |
| Post-War Arc           |     4 |
| Summit War Saga        |     4 |
| Whole Cake Island Saga |     4 |
| Dressrosa Arc          |     3 |
| Dressrosa Saga         |     3 |
| Egghead Arc            |     3 |
| Final Saga             |     3 |
| Overview               |     3 |
| Wano Country Arc       |     3 |
| Wano Country Saga      |     3 |
| Water 7 Arc            |     3 |
| East Blue Saga         |     2 |

| Table columns                            | Tables | Rows |
| ---------------------------------------- | -----: | ---: |
| Unit · Army Commander · Deputy Commander |      1 |    5 |

### Weapon Box — 6 page(s) surveyed

20.3 Qref citation(s) and 65 wikilink(s) per page.

| Section heading             | Pages |
| --------------------------- | ----: |
| References                  |     6 |
| Site Navigation             |     6 |
| Trivia                      |     6 |
| Appearance                  |     4 |
| Abilities                   |     3 |
| History                     |     2 |
| Video Game-Only Techniques  |     2 |
| Abilities and Powers        |     1 |
| Anime and Manga Differences |     1 |
| Axe Dial                    |     1 |
| Ball Dial                   |     1 |
| Breath Dial                 |     1 |
| Control Dial                |     1 |
| Current Poseidon            |     1 |
| Dial Types                  |     1 |
| Dial-Based Technology       |     1 |
| Dials In General            |     1 |
| Eisen Dial                  |     1 |
| Flame Dial                  |     1 |
| Flash Dial                  |     1 |

### Game Box — 6 page(s) surveyed

2.0 Qref citation(s) and 244 wikilink(s) per page.

| Section heading             | Pages |
| --------------------------- | ----: |
| Gameplay                    |     6 |
| Site Navigation             |     6 |
| Cast                        |     5 |
| Characters                  |     5 |
| External links              |     5 |
| Game Modes                  |     5 |
| Trivia                      |     5 |
| Gallery                     |     4 |
| Items                       |     4 |
| References                  |     4 |
| Bonus Features              |     3 |
| Notes                       |     3 |
| Training                    |     3 |
| Translation and Alterations |     3 |
| Treasure                    |     3 |
| Adventure Mode              |     2 |
| Battle Stages               |     2 |
| Cards                       |     2 |
| Event Battle                |     2 |
| Grand Battle                |     2 |

| Table columns                                                                                                                                                        | Tables | Rows |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | ---: |
| Name · Obtainment · Properties                                                                                                                                       |      7 |  128 |
| Item · Type · Effect                                                                                                                                                 |      3 |   43 |
| Role · Voice Actor (Japanese) · Voice Actor (English)                                                                                                                |      2 |  117 |
| Role · Voice Actor                                                                                                                                                   |      2 |   69 |
| (no header row)                                                                                                                                                      |      2 |   25 |
| List of Stages                                                                                                                                                       |      2 |   16 |
| Role · Japanese Voice Actor · English Voice Actor                                                                                                                    |      1 |   48 |
| Character · Support Character(s) · 1 · 2 · 3 · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| · \| |      1 |   25 |
| Class A · Class B · Class C                                                                                                                                          |      1 |   22 |
| Character · Support Character(s) · 1 · 2 · 3                                                                                                                         |      1 |   19 |
| Arena Name · Normal Appearance · Alternate Appearance                                                                                                                |      1 |   16 |
| Character · Support Character(s)                                                                                                                                     |      1 |   16 |
| Original Japanese Name · English Name Change                                                                                                                         |      1 |    9 |
| Color · Support                                                                                                                                                      |      1 |    6 |
| List of Boards                                                                                                                                                       |      1 |    5 |
| Color · Type                                                                                                                                                         |      1 |    3 |

### Spin-Off Chapter Box — 6 page(s) surveyed

0.0 Qref citation(s) and 33 wikilink(s) per page.

| Section heading                        | Pages |
| -------------------------------------- | ----: |
| Site Navigation                        |     6 |
| Author Comment                         |     5 |
| Characters                             |     5 |
| Plot Synopsis                          |     5 |
| Trivia                                 |     5 |
| Arc Navigation                         |     1 |
| Differences from the original chapters |     1 |
| Plot                                   |     1 |

### Arc Box — 6 page(s) surveyed

38.8 Qref citation(s) and 91 wikilink(s) per page.

| Section heading                                            | Pages |
| ---------------------------------------------------------- | ----: |
| Arc Navigation                                             |     6 |
| References                                                 |     6 |
| Site Navigation                                            |     6 |
| Story Impact                                               |     6 |
| Summary                                                    |     6 |
| Anime and Manga Differences                                |     5 |
| 4Kids Edits                                                |     4 |
| Trivia                                                     |     2 |
| Buggy's Flashy Finale: The Crew Departs                    |     1 |
| Defend the Baratie: The Chef and the Chore Boy's Battles   |     1 |
| From Play Pirate to Real Pirate: The Straw Hats Depart     |     1 |
| Hold the Hill: Battle Against the Black Cat Pirates        |     1 |
| Island of Rare Animals: The Man in the Treasure Chest      |     1 |
| Keep Your Feet Dry: Sanji Joins the Straw Hats             |     1 |
| Luffy's First Bounty: The Town of Beginnings and Endings   |     1 |
| Manga and Anime Differences                                |     1 |
| New and Old Faces: White Hunter Smoker and Buggy the Clown |     1 |
| On the High Seas: Luffy's First Voyage                     |     1 |
| Paying Dues: Of Bounty Hunters, Cooks, and Pirates         |     1 |
| Pirates are Coming! The Liar and the Deceiver              |     1 |

### Fighting Style Box — 6 page(s) surveyed

42.2 Qref citation(s) and 90 wikilink(s) per page.

| Section heading             | Pages |
| --------------------------- | ----: |
| References                  |     6 |
| Site Navigation             |     5 |
| Trivia                      |     4 |
| External links              |     3 |
| History                     |     3 |
| Overview                    |     2 |
| Techniques                  |     2 |
| Users                       |     2 |
| After the Timeskip          |     1 |
| Anime and Manga Differences |     1 |
| Arms                        |     1 |
| Before the Timeskip         |     1 |
| Both Arms                   |     1 |
| Buttocks                    |     1 |
| Dials                       |     1 |
| East Blue Saga              |     1 |
| Effects of Different Fuel   |     1 |
| Fridge                      |     1 |
| Gallery                     |     1 |
| Hair                        |     1 |

### Spin-Off Volume Box — 6 page(s) surveyed

1.2 Qref citation(s) and 81 wikilink(s) per page.

| Section heading               | Pages |
| ----------------------------- | ----: |
| Author's Notes                |     6 |
| Cover and Volume Illustration |     6 |
| References                    |     6 |
| Site Navigation               |     6 |
| Chapters                      |     5 |
| Minicomics                    |     5 |
| Trivia                        |     2 |
| Contents                      |     1 |

| Table columns                      | Tables | Rows |
| ---------------------------------- | -----: | ---: |
| (no header row)                    |      6 |    6 |
| Title · Pages · First Published In |      5 |   55 |

### Race Box — 6 page(s) surveyed

24.3 Qref citation(s) and 108 wikilink(s) per page.

| Section heading             | Pages |
| --------------------------- | ----: |
| Appearance                  |     6 |
| References                  |     6 |
| Site Navigation             |     6 |
| Trivia                      |     6 |
| Beliefs                     |     5 |
| Overall Strength            |     5 |
| Inter-species Relationships |     4 |
| Biology                     |     3 |
| History                     |     3 |
| Translation and Dub Issues  |     3 |
| External Links              |     2 |
| Gallery                     |     2 |
| Hybrids                     |     2 |
| Skypiea Arc                 |     2 |
| Abilities                   |     1 |
| Ancient Giants              |     1 |
| Anime and Manga Differences |     1 |
| Carmel                      |     1 |
| Charlotte Linlin            |     1 |
| Drawbacks and Weaknesses    |     1 |

### Merch Box — 6 page(s) surveyed

0.0 Qref citation(s) and 54 wikilink(s) per page.

| Section heading                | Pages |
| ------------------------------ | ----: |
| Site Navigation                |     6 |
| External Links                 |     3 |
| Monkey D. Luffy                |     2 |
| Nami                           |     2 |
| Portgas D. Ace                 |     2 |
| Tony Tony Chopper              |     2 |
| 2010                           |     1 |
| 2010's Line                    |     1 |
| 2011                           |     1 |
| 2012                           |     1 |
| 2013                           |     1 |
| 2014                           |     1 |
| A Netflix Series: One Piece    |     1 |
| Alabasta Saga                  |     1 |
| April                          |     1 |
| Ark Maxim                      |     1 |
| August                         |     1 |
| Baratie                        |     1 |
| Boa Hancock                    |     1 |
| Boa Hancock (with Salome Ver.) |     1 |

| Table columns | Tables | Rows |
| ------------- | -----: | ---: |
| November      |      5 |    5 |
| December      |      5 |    5 |
| May           |      4 |    5 |
| February      |      4 |    4 |
| June          |      4 |    4 |
| September     |      4 |    4 |
| October       |      4 |    4 |
| July          |      3 |    4 |
| March         |      3 |    3 |
| April         |      3 |    3 |
| August        |      3 |    3 |
| January       |      2 |    2 |

### Album Box — 6 page(s) surveyed

0.0 Qref citation(s) and 5 wikilink(s) per page.

| Section heading | Pages |
| --------------- | ----: |
| Site Navigation |     6 |
| Tracklist       |     4 |
| Track List      |     2 |
| Notes           |     1 |

| Table columns                                          | Tables | Rows |
| ------------------------------------------------------ | -----: | ---: |
| Track · Time · Artist · English · Romanized · Japanese |      4 |  152 |
| Track · Time · Artist · English · Romaji · Japanese    |      1 |   27 |
| Track · Time · Artist · English · Japanese             |      1 |    4 |

### Movie Box — 6 page(s) surveyed

0.5 Qref citation(s) and 84 wikilink(s) per page.

| Section heading            | Pages |
| -------------------------- | ----: |
| Cast                       |     6 |
| Site Navigation            |     6 |
| Trivia                     |     6 |
| Synopsis                   |     5 |
| External links             |     4 |
| References                 |     4 |
| Continuity Notes           |     3 |
| Extended Summary           |     3 |
| Release and Reception      |     3 |
| Plot                       |     2 |
| External Links             |     1 |
| Gallery                    |     1 |
| Summary                    |     1 |
| Translation and Dub Issues |     1 |

| Table columns           | Tables | Rows |
| ----------------------- | -----: | ---: |
| Voice actor · Character |      5 |   72 |

### Event Box — 6 page(s) surveyed

10.3 Qref citation(s) and 119 wikilink(s) per page.

| Section heading              | Pages |
| ---------------------------- | ----: |
| References                   |     6 |
| Site Navigation              |     6 |
| Aftermath                    |     5 |
| Trivia                       |     3 |
| History                      |     2 |
| Anime and Manga Differences  |     1 |
| Battle of Alubarna           |     1 |
| Blackbeard Pirates           |     1 |
| Course of Events             |     1 |
| Details                      |     1 |
| Escape from Marineford       |     1 |
| Legacy                       |     1 |
| Marines                      |     1 |
| Marines and World Government |     1 |
| Monkey D. Luffy              |     1 |
| New Allies Arrive            |     1 |
| Origin                       |     1 |
| Overview                     |     1 |
| Past                         |     1 |
| Pirates                      |     1 |

### Occupation Box — 6 page(s) surveyed

22.3 Qref citation(s) and 111 wikilink(s) per page.

| Section heading                             | Pages |
| ------------------------------------------- | ----: |
| References                                  |     6 |
| Site Navigation                             |     6 |
| Trivia                                      |     6 |
| Role and Duties                             |     3 |
| In One Piece                                |     2 |
| Abilities                                   |     1 |
| Admirals                                    |     1 |
| Admirals after the Summit War of Marineford |     1 |
| Archaeologists                              |     1 |
| Candidates to Become Admiral                |     1 |
| Cooks                                       |     1 |
| Current Admirals                            |     1 |
| Demalo Black                                |     1 |
| Demons of Ohara                             |     1 |
| Dressrosa Children and Tontatta Dwarves     |     1 |
| Duties                                      |     1 |
| Early Concepts                              |     1 |
| Executive Chef                              |     1 |
| External links                              |     1 |
| Fish-Man Island Children                    |     1 |

| Table columns | Tables | Rows |
| ------------- | -----: | ---: |
| Name · Notes  |      3 |   12 |

### International box — 6 page(s) surveyed

0.8 Qref citation(s) and 110 wikilink(s) per page.

| Section heading            | Pages |
| -------------------------- | ----: |
| Site Navigation            |     6 |
| References                 |     4 |
| Voice Actors               |     4 |
| Anime                      |     3 |
| Manga                      |     3 |
| Characters                 |     2 |
| External links             |     2 |
| History                    |     2 |
| Other                      |     2 |
| Broadcast and Movies       |     1 |
| Catalonia                  |     1 |
| Censorship                 |     1 |
| Character Name Changes     |     1 |
| Devil Fruits               |     1 |
| Dub and Translation Errors |     1 |
| Dubbing                    |     1 |
| First dub                  |     1 |
| Greek Opening              |     1 |
| Home Media                 |     1 |
| Merchandising              |     1 |

| Table columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Tables | Rows |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | ---: |
| Character · Voice Actor · Narrator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |      1 |  118 |
| Characters · Voice Actors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |      1 |   39 |
| Fruit · Dub translation · Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |      1 |   28 |
| Greek Lyrics · English Translation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |      1 |   18 |
| Character · Filipino Voice Actors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |      1 |   15 |
| Original Name · Catalan Name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |      1 |   15 |
| Character · Voice Actor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |      1 |   12 |
| (no header row)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |      1 |   11 |
| Characters · Catalan Voice Actors[https://www.eldoblatge.com/fitxa/1885 One Piece Dubbing Index]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |      1 |    9 |
| Known Casts · Character · Funimation VA · Ocean Productions VA · Bluewater Studios VA                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |      1 |    4 |
| Character · Filipino Dub Name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |      1 |    4 |
| Original Name · Changed Name · Monkey D. Luffy · Ντρέηκ (Drake) · Roronoa Zoro · Μπλακ Τζακ (Blackjack) · Nami · Μπόνι (Bonney) · Usopp · Γκας (Gus) · Sanji · Σάννυ (Sunny) · Tony Tony Chopper · Μπίλι (Billy) · Miss All-Sunday / Nico Robin · Δεσποινίς Ντόλυ (Miss Dolly) · Koby · Ρος (Ross) · Helmeppo · Χελμέρο (Helmero)Λάρι (Larry) · Gol D. Roger · Χρυσός Ρότζερ (Gold Roger)Χρυσοδάχτυλος Ρότζερ (Goldfinger Roger)(Arabasta onwards, he is called by his original name, Gol D. Roger) · Chouchou · Τουτού (Tutu) · Mohji · Θηριοδαμαστής Άγριων Ζώων (Tamer of Wild Animals) · Cabaji · Ακροβάτης (Acrobat) · Kaya · Σούζι (Suzie) · Tamanegi · Τόμι (Tommy) · Kuro · Κάπταιν Πητ (Captain Pete) · Kuina · Κέλι (Kelly) · Zeff · Τζεφ (Jeff) · Merry · Μάριο (Mario) · Patty · Τόνι (Tony) · Don Krieg · Δον Σαμ (Don Sam) · Dracule Mihawk · Γεράκι (Hawk) · Arlong · Ρίτσι (Richie) · Nojiko · Νόρα (Nora) · Bell-mère · Πάτι (Patty) · Genzo · Μπόμπι (Bobby) · Chew · Σίλυ (Silly) · Kuroobi · Καρχαρίας (Shark) · Hatchan · Χταπόδης (Octopus) · Nezumi · Ναύαρχος το Ποντίκι (Admiral Mouse) · Monkey D. Dragon · Λάκι (Lucky)Δράκος (Dragon) · Monkey D. Garp · Ριτς (Rich) · Smoker · Καπετάν Καπνός (Captain Smoke) · Tashigi · Ρόζι (Rosie)Πέννυ (Penny) · Apis · Λιάνα (Liana) · Ryu · Λάκι Ρου (Lucky Roux) · Kureha · Κρουέλα (Cruella) · Hiriluk · Χουρίκι (Huriki) · Crocus · Ρόκι (Rocky) · Miss Wednesday · Δεσποινίς Τζούλι (Miss Julie)(Vivi's real name wasn't changed) · Mr. 9 · Χούλιο (Julio)(It was later changed back to Mr. 9) · Karoo · Μαλού (Maloo) · Brogy · Γκρισίνο (Grissino) · Mr. 3 · Πράκτορας 3 (Agent 3) · Miss Goldenweek · Δεσποινίς Χάιντι (Miss Heidi) · Mr. 0Sir Crocodile · Πράκτορας 0 (Agent 0)Κύριος Κροκόδειλος (Mr. Crocodile) · Mr. 2 Bon Kurei · Πράκτορας 2 (Agent 2) · Wapol · Πόλυ (Polly) · Portgas D. AceFire Fist Ace · Πόρτους Έις (Portus Ace)Έις Φωτιά (Ace Fire) |      1 |    0 |

### Live-Action Episode Box — 6 page(s) surveyed

5.7 Qref citation(s) and 117 wikilink(s) per page.

| Section heading                   | Pages |
| --------------------------------- | ----: |
| Characters in Order of Appearance |     6 |
| Episode Notes                     |     6 |
| Plot                              |     6 |
| References                        |     6 |
| Site Navigation                   |     6 |
| Synopsis                          |     6 |
| Trivia                            |     6 |

### Scroll box — 6 page(s) surveyed

109.8 Qref citation(s) and 493 wikilink(s) per page.

| Section heading             | Pages |
| --------------------------- | ----: |
| References                  |     6 |
| Trivia                      |     6 |
| Gallery                     |     5 |
| Site Navigation             |     5 |
| Abilities and Powers        |     4 |
| Appearance                  |     4 |
| Enemies                     |     4 |
| Major Battles               |     4 |
| Other                       |     4 |
| Other Appearances           |     4 |
| Personality                 |     4 |
| Relationships               |     4 |
| Translation and Dub Issues  |     4 |
| Video Games                 |     4 |
| Weapons                     |     4 |
| Amazon Lily Arc             |     3 |
| Anime and Manga Differences |     3 |
| Armament Haki               |     3 |
| Egghead Arc                 |     3 |
| Final Saga                  |     3 |

| Table columns                                              | Tables | Rows |
| ---------------------------------------------------------- | -----: | ---: |
| Playable Characters · Character · Image · Style · Costumes |      1 |   37 |

### Manga Box — 6 page(s) surveyed

8.8 Qref citation(s) and 193 wikilink(s) per page.

| Section heading                             | Pages |
| ------------------------------------------- | ----: |
| References                                  |     6 |
| Site Navigation                             |     6 |
| Volumes                                     |     5 |
| Premise                                     |     4 |
| Publication History                         |     4 |
| Trivia                                      |     4 |
| Author Comments                             |     3 |
| Characters                                  |     3 |
| Easter Eggs                                 |     2 |
| Art With Alterations                        |     1 |
| Bartolomeo's New Wo Student List            |     1 |
| Chapters not yet published in volume format |     1 |
| Characters and Locations                    |     1 |
| Cover Gallery                               |     1 |
| Cover Series                                |     1 |
| Gallery                                     |     1 |
| Go! The Choppers                            |     1 |
| Installments                                |     1 |
| Messages                                    |     1 |
| Minicomics                                  |     1 |

| Table columns                                                                  | Tables | Rows |
| ------------------------------------------------------------------------------ | -----: | ---: |
| Author Comments · Chapter · Issue · Question · Translation · Transcript        |      3 |  117 |
| Issue & Cover · Release Date · # · Chapter                                     |      2 |   93 |
| (no header row)                                                                |      2 |    4 |
| Cover · Release Date · # · Chapter                                             |      1 |   53 |
| Vol. 3 · Vol. 5 · Vol. 7                                                       |      1 |    9 |
| 1 · 2 · 3 · 4 · 5 · 6 · Bonus                                                  |      1 |    8 |
| Chapters 1-6 · Chapter · Issue · Translation · Transcript · Translation Credit |      1 |    6 |

### Saga Box — 6 page(s) surveyed

0.5 Qref citation(s) and 25 wikilink(s) per page.

| Section heading | Pages |
| --------------- | ----: |
| Site Navigation |     6 |
| Story Arcs      |     6 |
| Filler Arcs     |     5 |
| Trivia          |     4 |
| References      |     2 |

### OVA Box — 3 page(s) surveyed

2.7 Qref citation(s) and 81 wikilink(s) per page.

| Section heading            | Pages |
| -------------------------- | ----: |
| References                 |     3 |
| Site Navigation            |     3 |
| Trivia                     |     3 |
| Cast                       |     2 |
| Beginning of the Great Age |     1 |
| Gallery                    |     1 |
| Legends Arrested           |     1 |
| Plot                       |     1 |
| Promotional Artwork        |     1 |
| Release and Reception      |     1 |
| Summary                    |     1 |
| Synopsis                   |     1 |
| The Battle of Edd War      |     1 |
| The Great Escape           |     1 |

| Table columns           | Tables | Rows |
| ----------------------- | -----: | ---: |
| Japanese VA · Character |      1 |   15 |
| Role · Voice Actor      |      1 |    8 |

### Animanga Box — 2 page(s) surveyed

12.5 Qref citation(s) and 409 wikilink(s) per page.

| Section heading          | Pages |
| ------------------------ | ----: |
| Anime                    |     2 |
| Episodes                 |     2 |
| Manga                    |     2 |
| References               |     2 |
| Site Navigation          |     2 |
| Volumes                  |     2 |
| Characters               |     1 |
| External links           |     1 |
| External Links           |     1 |
| Médecins Sans Frontières |     1 |
| Omake                    |     1 |
| Overview                 |     1 |
| Premise                  |     1 |
| Publication History      |     1 |

| Table columns                                                                                 | Tables | Rows |
| --------------------------------------------------------------------------------------------- | -----: | ---: |
| (no header row)                                                                               |      2 |    2 |
| Cover · Release Date · # · Chapter                                                            |      1 |  199 |
| Episode Number · Episode Name · Date · Combined Length · Manga Chapters Covered · Description |      1 |    7 |

### Facebook box — 1 page(s) surveyed

0.0 Qref citation(s) and 26 wikilink(s) per page.

### Game box — 1 page(s) surveyed

0.0 Qref citation(s) and 6 wikilink(s) per page.

| Section heading | Pages |
| --------------- | ----: |
| 1970s           |     1 |
| 1980s           |     1 |
| 1990s           |     1 |
| 2000s           |     1 |
| 2010s           |     1 |
| Characters      |     1 |
| External Links  |     1 |
| Gallery         |     1 |
| Gameplay        |     1 |
| Site Navigation |     1 |

### Ship box — 1 page(s) surveyed

1.0 Qref citation(s) and 23 wikilink(s) per page.

| Section heading             | Pages |
| --------------------------- | ----: |
| Anime and Manga Differences |     1 |
| History                     |     1 |
| References                  |     1 |
| Ship Design and Appearance  |     1 |
| Site Navigation             |     1 |
| Trivia                      |     1 |

## Gaps

### Unmapped infobox fields (top 40 by occurrence)

| Template                | Field        | Occurrences | Shape                                          |
| ----------------------- | ------------ | ----------: | ---------------------------------------------- |
| Live-Action Episode Box | Airdate      |           6 | date (100% filled, 1 distinct)                 |
| Spin-Off Volume Box     | author       |           6 | enum_like (100% filled, 2 distinct)            |
| Manga Box               | author       |           6 | template (100% filled, 6 distinct)             |
| Movie Box               | biliDate     |           6 | date (100% filled, 2 distinct)                 |
| Movie Box               | biliName     |           6 | text (100% filled, 6 distinct)                 |
| International box       | censorship   |           6 | text (100% filled, 5 distinct)                 |
| Saga Box                | chapter      |           6 | enum_like (100% filled, 1 distinct)            |
| Manga Box               | chapters     |           6 | template (100% filled, 6 distinct)             |
| Island Box              | colorscheme  |           6 | text (100% filled, 6 distinct)                 |
| Simple Box              | colorscheme  |           6 | text (100% filled, 5 distinct)                 |
| Fighting Style Box      | colorscheme  |           6 | enum_like (100% filled, 3 distinct)            |
| Race Box                | colorscheme  |           6 | text (100% filled, 6 distinct)                 |
| Event Box               | colorscheme  |           6 | enum_like (100% filled, 3 distinct)            |
| International box       | continent    |           6 | enum_like (100% filled, 3 distinct)            |
| Live-Action Episode Box | Credit_Music |           6 | wikilink_list (100% filled, 6 distinct, multi) |
| Spin-Off Chapter Box    | date         |           6 | text (100% filled, 6 distinct)                 |
| Merch Box               | date         |           6 | text (100% filled, 6 distinct)                 |
| Movie Box               | date         |           6 | text (100% filled, 6 distinct, multi)          |
| Saga Box                | date         |           6 | text (100% filled, 6 distinct, multi)          |
| Game Box                | developer    |           6 | template (100% filled, 4 distinct)             |
| Movie Box               | director     |           6 | text (100% filled, 5 distinct)                 |
| Live-Action Episode Box | Director     |           6 | template (100% filled, 4 distinct)             |
| Spin-Off Volume Box     | djdate       |           6 | date (100% filled, 6 distinct)                 |
| Spin-Off Chapter Box    | ename        |           6 | text (100% filled, 6 distinct)                 |
| Fighting Style Box      | ename        |           6 | template (100% filled, 4 distinct)             |
| Race Box                | ename        |           6 | text (100% filled, 6 distinct, multi)          |
| Event Box               | ename        |           6 | template (100% filled, 6 distinct, multi)      |
| Saga Box                | episode      |           6 | enum_like (100% filled, 2 distinct)            |
| Live-Action Episode Box | Episode      |           6 | number (100% filled, 6 distinct)               |
| Race Box                | features     |           6 | template (100% filled, 6 distinct)             |
| Island Box              | first        |           6 | wikilink_list (100% filled, 6 distinct, multi) |
| Fighting Style Box      | first        |           6 | wikilink_list (100% filled, 6 distinct, multi) |
| Race Box                | first        |           6 | wikilink_list (100% filled, 6 distinct, multi) |
| Occupation Box          | first        |           6 | wikilink_list (100% filled, 5 distinct, multi) |
| Fighting Style Box      | focus        |           6 | template (100% filled, 6 distinct)             |
| Game Box                | genre        |           6 | text (100% filled, 6 distinct)                 |
| Manga Box               | genre        |           6 | text (100% filled, 4 distinct)                 |
| Game Box                | image        |           6 | text (100% filled, 6 distinct)                 |
| Merch Box               | image        |           6 | text (100% filled, 4 distinct)                 |
| Album Box               | image        |           6 | wikilink (100% filled, 2 distinct)             |

### Categories without an entity type (top 30 by page count)

| Category                                | Pages |
| --------------------------------------- | ----: |
| Blog posts                              |  6088 |
| Alternative Name Redirects              |  5746 |
| Authorized Redirects                    |  1365 |
| Male Characters                         |  1105 |
| Humans                                  |  1051 |
| Archived Threads                        |   838 |
| Non-Canon Humans                        |   695 |
| Non-Canon Male Characters               |   649 |
| Redirects to Authorized Redirects       |   604 |
| Female Characters                       |   339 |
| Site Problems Threads                   |   332 |
| One Piece Manga Threads                 |   331 |
| Episodes Art Directed by Miyuki Sato    |   300 |
| Romaji Templates                        |   272 |
| Episodes Art Directed by Miho Shiraishi |   269 |
| Episodes Art Directed by Ryūji Yoshiike |   265 |
| Swordsmen                               |   249 |
| Pages With Empty Sections               |   243 |
| Deleted File Talk Pages                 |   204 |
| Flashback Introduction Characters       |   201 |
| Season 20                               |   194 |
| Wano Country Arc Episodes               |   191 |
| Featured Articles                       |   190 |
| Articles Without an Infobox             |   188 |
| Non-Canon Female Characters             |   173 |
| Episodes Written by Hirohiko Kamisaka   |   170 |
| Articles Without an Infobox Image       |   169 |
| Episodes Written by Jin Tanaka          |   166 |
| Episodes Animated by Kenji Yokoyama     |   150 |
| Episodes Written by Yoshiyuki Suga      |   149 |

…and 2591 more (see the JSON report).

### Entity types without a Fandom source

- `concept`
- `databook-card`
- `document`
- `live-action-series`
- `material`
- `person`
- `reference`
- `sbs-qa`
- `streaming-platform`
- `technique`
- `theme-song`
- `title`
- `transformation`
