import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('test')
export class Test {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "uuid", nullable: true })
    test: string;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
