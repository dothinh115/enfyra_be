import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity('setting_definition')
export class Setting_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "simple-json", nullable: true, update: false })
    actionPermissionValue: any;
    @Column({ type: "boolean", nullable: false, default: false })
    isInit: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "varchar", nullable: true })
    projectDescription: string;
    @Column({ type: "varchar", nullable: true })
    projectName: string;
    @Column({ type: "varchar", nullable: true })
    projectUrl: string;
    @Column({ type: "varchar", nullable: true, default: "test" })
    test: string;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
