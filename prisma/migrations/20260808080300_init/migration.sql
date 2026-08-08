-- CreateTable
CREATE TABLE "Challenge" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "platform" TEXT NOT NULL DEFAULT '',
    "platformUrl" TEXT,
    "tldr" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "readmePath" TEXT NOT NULL,
    "groupPath" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "SolveScript" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "challengeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    CONSTRAINT "SolveScript_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Vulnerability" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT '',
    "cve" TEXT NOT NULL DEFAULT '',
    "complexity" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "readmePath" TEXT NOT NULL,
    "groupPath" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "VulnTag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ChallengeToTag" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ChallengeToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Challenge" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ChallengeToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_VulnTagToVulnerability" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_VulnTagToVulnerability_A_fkey" FOREIGN KEY ("A") REFERENCES "VulnTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_VulnTagToVulnerability_B_fkey" FOREIGN KEY ("B") REFERENCES "Vulnerability" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "VulnTag_name_key" ON "VulnTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_ChallengeToTag_AB_unique" ON "_ChallengeToTag"("A", "B");

-- CreateIndex
CREATE INDEX "_ChallengeToTag_B_index" ON "_ChallengeToTag"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_VulnTagToVulnerability_AB_unique" ON "_VulnTagToVulnerability"("A", "B");

-- CreateIndex
CREATE INDEX "_VulnTagToVulnerability_B_index" ON "_VulnTagToVulnerability"("B");
