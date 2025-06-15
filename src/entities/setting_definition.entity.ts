import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity('setting_definition')
export class Setting_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "boolean", nullable: false, default: false })
    isInit: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
